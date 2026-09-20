import express from "express";
import session from "express-session";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(process.env.DATABASE_FILE || path.join(dataDir, "bous_lakay.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 133,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || "CHANGE_ME_IN_PRODUCTION",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false }
}));

app.use(express.static(path.join(__dirname, "public")));

function hash(p) {
  return crypto.createHash("sha256").update(String(p)).digest("hex");
}
function makeClientId() {
  return "CL-" + Math.floor(10000 + Math.random() * 90000);
}
function user(req) {
  return req.session.userId
    ? db.prepare("SELECT id, client_id, full_name, phone, balance, created_at FROM users WHERE id=?").get(req.session.userId)
    : null;
}
function auth(req,res,next) {
  const u=user(req);
  if(!u) return res.status(401).json({error:"Ou pa konekte."});
  req.currentUser=u; next();
}
function admin(req,res,next) {
  if(!req.session.admin) return res.status(401).json({error:"Accès admin refize."});
  next();
}

app.get("/api/me",(req,res)=>res.json({user:user(req)}));

app.post("/api/register",(req,res)=>{
  const {fullName,phone,password}=req.body;
  if(!fullName || !phone || !password || String(password).length < 6)
    return res.status(400).json({error:"Ranpli non, telefòn ak yon modpas ki gen omwen 6 karaktè."});
  let clientId=makeClientId();
  while(db.prepare("SELECT 1 FROM users WHERE client_id=?").get(clientId)) clientId=makeClientId();
  try{
    const info=db.prepare("INSERT INTO users(client_id,full_name,phone,password_hash,balance) VALUES(?,?,?,?,133)")
      .run(clientId,String(fullName).trim(),String(phone).trim(),hash(password));
    req.session.userId=info.lastInsertRowid;
    res.json({ok:true,user:user(req)});
  }catch(e){ res.status(400).json({error:"Telefòn sa a ka deja itilize."}); }
});

app.post("/api/login",(req,res)=>{
  const {phone,password}=req.body;
  const u=db.prepare("SELECT * FROM users WHERE phone=? AND password_hash=?").get(String(phone||"").trim(),hash(password||""));
  if(!u) return res.status(401).json({error:"Telefòn oswa modpas pa kòrèk."});
  req.session.userId=u.id;
  res.json({ok:true,user:user(req)});
});

app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get("/api/transactions",auth,(req,res)=>{
  const rows=db.prepare("SELECT id,type,amount,method,reference,status,created_at FROM transactions WHERE user_id=? ORDER BY id DESC").all(req.currentUser.id);
  res.json({transactions:rows});
});

app.post("/api/deposit",auth,(req,res)=>{
  const {amount,method,reference}=req.body;
  const n=Number(amount);
  if(!Number.isInteger(n)||n<=0||!method||!reference)
    return res.status(400).json({error:"Montan, metòd ak referans obligatwa."});
  db.prepare("INSERT INTO transactions(user_id,type,amount,method,reference,status) VALUES(?,?,?,?,?,'pending')")
    .run(req.currentUser.id,"deposit",n,String(method),String(reference).trim());
  res.json({ok:true,message:"Demann depo a voye. Admin lan dwe verifye tranzaksyon an anvan balans lan ogmante."});
});

app.post("/api/withdraw",auth,(req,res)=>{
  const n=Number(req.body.amount);
  const method=String(req.body.method||"").trim();
  if(!Number.isInteger(n)||n<=0||!method) return res.status(400).json({error:"Montan ak metòd obligatwa."});
  if(n>req.currentUser.balance) return res.status(400).json({error:"Balans ou pa ase."});
  db.prepare("INSERT INTO transactions(user_id,type,amount,method,status) VALUES(?,?,?,?, 'pending')")
    .run(req.currentUser.id,"withdraw",n,method);
  res.json({ok:true,message:"Demann retrè a anrejistre kòm pending. Li bezwen verifikasyon admin."});
});

app.post("/api/admin/login",(req,res)=>{
  const u=process.env.ADMIN_USERNAME||"admin";
  const p=process.env.ADMIN_PASSWORD||"change-this-password";
  if(req.body.username===u && req.body.password===p){req.session.admin=true; return res.json({ok:true});}
  res.status(401).json({error:"Admin login pa kòrèk."});
});
app.post("/api/admin/logout",(req,res)=>{req.session.admin=false;res.json({ok:true});});

app.get("/api/admin/users",admin,(req,res)=>{
  res.json({users:db.prepare("SELECT id,client_id,full_name,phone,balance,created_at FROM users ORDER BY id DESC").all()});
});
app.get("/api/admin/transactions",admin,(req,res)=>{
  res.json({transactions:db.prepare(`
    SELECT t.*,u.client_id,u.full_name,u.phone
    FROM transactions t JOIN users u ON u.id=t.user_id
    ORDER BY t.id DESC`).all()});
});

app.post("/api/admin/deposit/approve",admin,(req,res)=>{
  const id=Number(req.body.transactionId);
  const tx=db.prepare("SELECT * FROM transactions WHERE id=? AND type='deposit' AND status='pending'").get(id);
  if(!tx) return res.status(404).json({error:"Demann depo a pa disponib."});
  const apply=db.transaction(()=>{
    db.prepare("UPDATE transactions SET status='approved' WHERE id=?").run(id);
    db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(tx.amount,tx.user_id);
  });
  apply();
  res.json({ok:true});
});

app.post("/api/admin/withdraw/approve",admin,(req,res)=>{
  const id=Number(req.body.transactionId);
  const tx=db.prepare("SELECT * FROM transactions WHERE id=? AND type='withdraw' AND status='pending'").get(id);
  if(!tx) return res.status(404).json({error:"Demann retrè a pa disponib."});
  const u=db.prepare("SELECT balance FROM users WHERE id=?").get(tx.user_id);
  if(!u || u.balance<tx.amount) return res.status(400).json({error:"Balans kliyan an pa ase."});
  const apply=db.transaction(()=>{
    db.prepare("UPDATE transactions SET status='approved' WHERE id=?").run(id);
    db.prepare("UPDATE users SET balance=balance-? WHERE id=?").run(tx.amount,tx.user_id);
  });
  apply();
  res.json({ok:true});
});

app.post("/api/admin/transaction/reject",admin,(req,res)=>{
  const id=Number(req.body.transactionId);
  const info=db.prepare("UPDATE transactions SET status='rejected' WHERE id=? AND status='pending'").run(id);
  if(!info.changes) return res.status(404).json({error:"Demann pa disponib."});
  res.json({ok:true});
});

app.post("/api/admin/credit",admin,(req,res)=>{
  const clientId=String(req.body.clientId||"").trim();
  const amount=Number(req.body.amount);
  const reference=String(req.body.reference||"ADMIN").trim();
  const u=db.prepare("SELECT * FROM users WHERE client_id=?").get(clientId);
  if(!u || !Number.isInteger(amount) || amount<=0) return res.status(400).json({error:"ID kliyan oswa montan pa valab."});
  const apply=db.transaction(()=>{
    db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(amount,u.id);
    db.prepare("INSERT INTO transactions(user_id,type,amount,method,reference,status) VALUES(?,?,?,?,?,'approved')")
      .run(u.id,"admin_credit",amount,"admin",reference);
  });
  apply();
  res.json({ok:true});
});

app.get("/admin",(req,res)=>{
  res.sendFile(path.join(__dirname,"public","admin.html"));
});
app.listen(port,()=>console.log(`Bous Lakay running on http://localhost:${port}`));
