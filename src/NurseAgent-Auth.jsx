import { useState, useRef, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ══════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════
const MODEL = "claude-sonnet-4-20250514";

// Clé de stockage global (comptes + données)
const ACCOUNTS_KEY = "nurseagent_accounts_v1";
const SESSION_KEY  = "nurseagent_session_v1";

// Hash simple (SHA-256 via Web Crypto)
async function hashPassword(password) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

// Appel IA
async function ai(messages, sys) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, system: sys, messages })
  });
  const d = await r.json();
  return d.content?.map(b => b.text || "").join("\n") || "Erreur de connexion IA.";
}

// ══════════════════════════════════════════════════════
// COULEURS & THÈME
// ══════════════════════════════════════════════════════
const C = {
  blue:"#0ea5e9", green:"#22c55e", red:"#ef4444",
  yellow:"#f59e0b", purple:"#8b5cf6", orange:"#f97316",
  teal:"#14b8a6", pink:"#ec4899"
};

const T = {
  bg:"#080e1a",
  card:"#0f1829",
  card2:"#162035",
  border:"#1e3050",
  text:"#e2eeff",
  muted:"#7a9abe",
  dim:"#3a5070",
  accent:"#0ea5e9"
};

// Rôles
const ROLES = {
  admin:     { label:"Administrateur", icon:"🔑", color:C.red },
  cadre:     { label:"Cadre de santé", icon:"👔", color:C.purple },
  infirmier: { label:"Infirmier(e)",   icon:"🩺", color:C.blue },
  aide:      { label:"Aide-soignant(e)",icon:"🤝",color:C.teal },
};

// ══════════════════════════════════════════════════════
// STORAGE HELPERS
// ══════════════════════════════════════════════════════
async function loadAccounts() {
  try {
    const r = await window.storage.get(ACCOUNTS_KEY);
    if (r?.value) return JSON.parse(r.value);
  } catch {}
  return null;
}

async function saveAccounts(data) {
  try { await window.storage.set(ACCOUNTS_KEY, JSON.stringify(data)); } catch {}
}

async function loadUserData(userId) {
  try {
    const r = await window.storage.get(`nurseagent_data_${userId}`);
    if (r?.value) return JSON.parse(r.value);
  } catch {}
  return { patients:[], alerts:[], protocols:[], serviceDesc:"", chatHistory:[] };
}

async function saveUserData(userId, data) {
  try { await window.storage.set(`nurseagent_data_${userId}`, JSON.stringify(data)); } catch {}
}

// ══════════════════════════════════════════════════════
// ÉCRAN DE CHARGEMENT
// ══════════════════════════════════════════════════════
function LoadingScreen() {
  return (
    <div style={{
      minHeight:"100vh", background:T.bg, display:"flex",
      alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16
    }}>
      <div style={{
        width:70, height:70, borderRadius:"50%",
        background:`conic-gradient(${C.blue}, transparent)`,
        animation:"spin 1s linear infinite",
        display:"flex", alignItems:"center", justifyContent:"center"
      }}>
        <div style={{width:56,height:56,borderRadius:"50%",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>🧠</div>
      </div>
      <p style={{color:C.blue,fontWeight:700,fontSize:15,margin:0,letterSpacing:1}}>NurseAgent AI</p>
      <p style={{color:T.muted,fontSize:12,margin:0}}>Chargement...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ÉCRAN DE SETUP (premier lancement)
// ══════════════════════════════════════════════════════
function SetupScreen({ onComplete }) {
  const [step, setStep] = useState(1);
  const [serviceName, setServiceName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminLogin, setAdminLogin] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [adminPass2, setAdminPass2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const inp = {
    width:"100%", background:"#0a1220", border:`1px solid ${T.border}`,
    borderRadius:10, padding:"12px 14px", color:T.text, fontSize:14,
    boxSizing:"border-box", outline:"none", marginBottom:10
  };
  const lbl = {
    fontSize:11, color:T.muted, marginBottom:5, display:"block",
    fontWeight:700, textTransform:"uppercase", letterSpacing:.8
  };

  const handleCreate = async () => {
    if (!serviceName.trim()) { setError("Nom du service obligatoire"); return; }
    if (!adminName.trim() || !adminLogin.trim()) { setError("Informations admin incomplètes"); return; }
    if (adminPass.length < 6) { setError("Mot de passe min. 6 caractères"); return; }
    if (adminPass !== adminPass2) { setError("Mots de passe différents"); return; }
    setLoading(true);
    const hashed = await hashPassword(adminPass);
    const accounts = {
      serviceName,
      users: [{
        id: "admin_001",
        name: adminName,
        login: adminLogin.toLowerCase(),
        password: hashed,
        role: "admin",
        createdAt: new Date().toLocaleDateString("fr-FR"),
        active: true
      }]
    };
    await saveAccounts(accounts);
    setLoading(false);
    onComplete(accounts);
  };

  return (
    <div style={{
      minHeight:"100vh", background:T.bg, display:"flex",
      alignItems:"center", justifyContent:"center", padding:20, fontFamily:"'Segoe UI',sans-serif"
    }}>
      <style>{`input:focus{border-color:${C.blue}!important;box-shadow:0 0 0 3px ${C.blue}18}`}</style>
      <div style={{width:"100%",maxWidth:420}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{
            width:72,height:72,borderRadius:"50%",
            background:`linear-gradient(135deg,${C.blue},${C.purple})`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:34,margin:"0 auto 12px",
            boxShadow:`0 0 40px ${C.blue}44`
          }}>🧠</div>
          <h1 style={{margin:"0 0 4px",color:T.text,fontSize:22,fontWeight:800}}>NurseAgent AI</h1>
          <p style={{margin:0,color:T.muted,fontSize:13}}>Configuration initiale du service</p>
        </div>

        {/* Étapes */}
        <div style={{display:"flex",gap:6,marginBottom:24,justifyContent:"center"}}>
          {[1,2].map(s => (
            <div key={s} style={{
              width:32,height:4,borderRadius:4,
              background:step>=s?C.blue:T.border,
              transition:"all .3s"
            }}/>
          ))}
        </div>

        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:22}}>
          {step===1 && <>
            <h2 style={{margin:"0 0 16px",color:T.text,fontSize:16}}>🏥 Votre service</h2>
            <label style={lbl}>Nom du service</label>
            <input style={inp} placeholder="Ex: Service Cardiologie — CHU Tunis"
              value={serviceName} onChange={e=>setServiceName(e.target.value)}/>
            <p style={{margin:"0 0 16px",fontSize:12,color:T.muted}}>
              Ce nom apparaîtra sur toutes les fiches et exports PDF.
            </p>
            <button
              style={{width:"100%",background:`linear-gradient(135deg,${C.blue},${C.purple})`,
                color:"#fff",border:"none",borderRadius:10,padding:"12px",
                cursor:"pointer",fontWeight:700,fontSize:14}}
              onClick={()=>{ if(!serviceName.trim()){setError("Obligatoire");return;} setError("");setStep(2); }}
            >Suivant →</button>
          </>}

          {step===2 && <>
            <h2 style={{margin:"0 0 4px",color:T.text,fontSize:16}}>🔑 Compte Administrateur</h2>
            <p style={{margin:"0 0 14px",fontSize:12,color:T.muted}}>
              Ce compte pourra créer/gérer tous les utilisateurs du service.
            </p>
            <label style={lbl}>Nom complet</label>
            <input style={inp} placeholder="Dr. / Mme / M. ..." value={adminName} onChange={e=>setAdminName(e.target.value)}/>
            <label style={lbl}>Identifiant de connexion</label>
            <input style={inp} placeholder="ex: admin, responsable..." value={adminLogin} onChange={e=>setAdminLogin(e.target.value)}/>
            <label style={lbl}>Mot de passe (min. 6 caractères)</label>
            <input style={inp} type="password" placeholder="••••••••" value={adminPass} onChange={e=>setAdminPass(e.target.value)}/>
            <label style={lbl}>Confirmer le mot de passe</label>
            <input style={inp} type="password" placeholder="••••••••" value={adminPass2} onChange={e=>setAdminPass2(e.target.value)}/>
            {error && <p style={{color:C.red,fontSize:12,margin:"0 0 10px",fontWeight:600}}>⚠️ {error}</p>}
            <div style={{display:"flex",gap:8}}>
              <button style={{flex:1,background:T.card2,color:T.muted,border:`1px solid ${T.border}`,borderRadius:10,padding:"11px",cursor:"pointer",fontWeight:700,fontSize:13}} onClick={()=>setStep(1)}>← Retour</button>
              <button
                style={{flex:2,background:`linear-gradient(135deg,${C.green},${C.teal})`,color:"#fff",border:"none",borderRadius:10,padding:"11px",cursor:"pointer",fontWeight:700,fontSize:13}}
                onClick={handleCreate} disabled={loading}
              >{loading?"Création...":"✓ Créer le service"}</button>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ÉCRAN DE LOGIN
// ══════════════════════════════════════════════════════
function LoginScreen({ accounts, onLogin }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const inp = {
    width:"100%",background:"#0a1220",border:`1px solid ${T.border}`,
    borderRadius:10,padding:"12px 14px",color:T.text,fontSize:15,
    boxSizing:"border-box",outline:"none"
  };
  const lbl = {fontSize:11,color:T.muted,marginBottom:5,display:"block",fontWeight:700,textTransform:"uppercase",letterSpacing:.8};

  const handleLogin = async () => {
    if (!login.trim() || !password) { setError("Identifiant et mot de passe requis"); return; }
    setLoading(true); setError("");
    const hashed = await hashPassword(password);
    const user = accounts.users.find(u =>
      u.login === login.toLowerCase().trim() &&
      u.password === hashed &&
      u.active
    );
    setLoading(false);
    if (!user) { setError("Identifiant ou mot de passe incorrect"); return; }
    onLogin(user);
  };

  return (
    <div style={{
      minHeight:"100vh",background:T.bg,display:"flex",
      alignItems:"center",justifyContent:"center",padding:20,
      fontFamily:"'Segoe UI',sans-serif"
    }}>
      <style>{`
        input:focus{border-color:${C.blue}!important;box-shadow:0 0 0 3px ${C.blue}18}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp .4s ease forwards}
      `}</style>

      {/* Fond décoratif */}
      <div style={{position:"fixed",inset:0,overflow:"hidden",pointerEvents:"none"}}>
        <div style={{position:"absolute",top:-100,left:-100,width:400,height:400,borderRadius:"50%",background:`radial-gradient(circle,${C.blue}18,transparent 70%)`}}/>
        <div style={{position:"absolute",bottom:-100,right:-100,width:300,height:300,borderRadius:"50%",background:`radial-gradient(circle,${C.purple}15,transparent 70%)`}}/>
      </div>

      <div className="fade-up" style={{width:"100%",maxWidth:380,position:"relative"}}>
        {/* En-tête */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{
            width:80,height:80,borderRadius:"50%",
            background:`linear-gradient(135deg,#0a1830,#1a3060)`,
            border:`2px solid ${C.blue}55`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:36,margin:"0 auto 14px",
            boxShadow:`0 0 50px ${C.blue}33`
          }}>🧠</div>
          <h1 style={{margin:"0 0 3px",color:T.text,fontSize:24,fontWeight:800,letterSpacing:-0.5}}>NurseAgent AI</h1>
          <p style={{margin:0,color:C.blue,fontSize:13,fontWeight:600}}>{accounts.serviceName}</p>
        </div>

        {/* Carte login */}
        <div style={{
          background:T.card,border:`1px solid ${T.border}`,
          borderRadius:18,padding:24,
          boxShadow:"0 20px 60px #00000060"
        }}>
          <p style={{margin:"0 0 18px",color:T.muted,fontSize:13,textAlign:"center"}}>
            Connectez-vous avec vos identifiants
          </p>

          <label style={lbl}>Identifiant</label>
          <input style={{...inp,marginBottom:12}} placeholder="votre identifiant"
            value={login} onChange={e=>setLogin(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            autoComplete="username"
          />

          <label style={lbl}>Mot de passe</label>
          <div style={{position:"relative",marginBottom:16}}>
            <input
              style={{...inp,paddingRight:44}}
              type={showPass?"text":"password"}
              placeholder="••••••••"
              value={password}
              onChange={e=>setPassword(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              autoComplete="current-password"
            />
            <button onClick={()=>setShowPass(v=>!v)} style={{
              position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
              background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:16
            }}>{showPass?"🙈":"👁️"}</button>
          </div>

          {error && (
            <div style={{
              background:C.red+"18",border:`1px solid ${C.red}44`,
              borderRadius:9,padding:"9px 12px",marginBottom:14,
              color:C.red,fontSize:12,fontWeight:600
            }}>⚠️ {error}</div>
          )}

          <button
            onClick={handleLogin} disabled={loading}
            style={{
              width:"100%",padding:"13px",border:"none",borderRadius:11,
              background:loading?T.dim:`linear-gradient(135deg,${C.blue},${C.purple})`,
              color:"#fff",fontWeight:800,fontSize:15,cursor:loading?"not-allowed":"pointer",
              boxShadow:loading?"none":`0 4px 20px ${C.blue}44`,
              transition:"all .2s"
            }}
          >{loading?"Vérification...":"Se connecter"}</button>
        </div>

        {/* Liste des utilisateurs actifs (sans mots de passe) */}
        <div style={{marginTop:16,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:12}}>
          <p style={{margin:"0 0 8px",fontSize:10,color:T.dim,fontWeight:700,textTransform:"uppercase",letterSpacing:.8}}>Personnel du service</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {accounts.users.filter(u=>u.active).map(u=>(
              <div
                key={u.id}
                onClick={()=>setLogin(u.login)}
                style={{
                  background:ROLES[u.role]?.color+"18",
                  border:`1px solid ${ROLES[u.role]?.color}44`,
                  borderRadius:20,padding:"4px 10px",
                  cursor:"pointer",display:"flex",alignItems:"center",gap:5
                }}
              >
                <span style={{fontSize:12}}>{ROLES[u.role]?.icon}</span>
                <span style={{fontSize:11,color:T.text,fontWeight:600}}>{u.name.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{textAlign:"center",color:T.dim,fontSize:11,marginTop:12}}>
          🔒 Données stockées localement · Accès réservé au personnel autorisé
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// PANNEAU ADMIN — Gestion des comptes
// ══════════════════════════════════════════════════════
function AdminPanel({ accounts, currentUser, onUpdate, onClose }) {
  const [users, setUsers] = useState(accounts.users);
  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState({ name:"", login:"", password:"", role:"infirmier" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [editId, setEditId] = useState(null);
  const [resetPass, setResetPass] = useState({ id:null, val:"" });

  const inp = {width:"100%",background:"#0a1220",border:`1px solid ${T.border}`,borderRadius:9,padding:"9px 12px",color:T.text,fontSize:13,boxSizing:"border-box",outline:"none",marginBottom:8};
  const lbl = {fontSize:10,color:T.muted,marginBottom:3,display:"block",fontWeight:700,textTransform:"uppercase",letterSpacing:.8};

  const saveAll = async (newUsers) => {
    const updated = {...accounts, users:newUsers};
    await saveAccounts(updated);
    onUpdate(updated);
    setSaved(true);
    setTimeout(()=>setSaved(false),2000);
  };

  const handleAdd = async () => {
    if (!newUser.name.trim()||!newUser.login.trim()) { setError("Nom et identifiant requis"); return; }
    if (newUser.password.length<6) { setError("Mot de passe min. 6 caractères"); return; }
    if (users.find(u=>u.login===newUser.login.toLowerCase())) { setError("Identifiant déjà utilisé"); return; }
    const hashed = await hashPassword(newUser.password);
    const u = {
      id:`user_${Date.now()}`,
      name:newUser.name,
      login:newUser.login.toLowerCase(),
      password:hashed,
      role:newUser.role,
      createdAt:new Date().toLocaleDateString("fr-FR"),
      active:true
    };
    const updated = [...users, u];
    setUsers(updated);
    setNewUser({name:"",login:"",password:"",role:"infirmier"});
    setAdding(false);
    setError("");
    await saveAll(updated);
  };

  const toggleActive = async (id) => {
    if (id===currentUser.id) { setError("Vous ne pouvez pas désactiver votre propre compte"); return; }
    const updated = users.map(u=>u.id===id?{...u,active:!u.active}:u);
    setUsers(updated);
    await saveAll(updated);
  };

  const handleResetPass = async (id) => {
    if (resetPass.val.length<6) { setError("Mot de passe min. 6 caractères"); return; }
    const hashed = await hashPassword(resetPass.val);
    const updated = users.map(u=>u.id===id?{...u,password:hashed}:u);
    setUsers(updated);
    setResetPass({id:null,val:""});
    await saveAll(updated);
  };

  const deleteUser = async (id) => {
    if (id===currentUser.id) { setError("Impossible de supprimer votre propre compte"); return; }
    if (!confirm("Supprimer cet utilisateur et toutes ses données ?")) return;
    try { await window.storage.delete(`nurseagent_data_${id}`); } catch {}
    const updated = users.filter(u=>u.id!==id);
    setUsers(updated);
    await saveAll(updated);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#000d",zIndex:400,display:"flex",alignItems:"flex-end",fontFamily:"'Segoe UI',sans-serif"}}>
      <div style={{background:T.card,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:500,margin:"0 auto",padding:18,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <p style={{margin:0,fontWeight:800,fontSize:16,color:T.text}}>🔑 Gestion du Personnel</p>
            <p style={{margin:0,fontSize:11,color:T.muted}}>{accounts.serviceName}</p>
          </div>
          <button style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:22}} onClick={onClose}>✕</button>
        </div>

        {saved&&<div style={{background:C.green+"18",border:`1px solid ${C.green}`,borderRadius:9,padding:"8px 12px",marginBottom:10,color:C.green,fontSize:12,fontWeight:700}}>✓ Sauvegardé</div>}
        {error&&<div style={{background:C.red+"18",border:`1px solid ${C.red}`,borderRadius:9,padding:"8px 12px",marginBottom:10,color:C.red,fontSize:12,fontWeight:700}} onClick={()=>setError("")}>⚠️ {error} (tap pour fermer)</div>}

        {/* Liste utilisateurs */}
        {users.map(u=>(
          <div key={u.id} style={{
            background:T.card2,border:`1px solid ${u.active?ROLES[u.role]?.color+"44":T.border}`,
            borderRadius:12,padding:12,marginBottom:8,
            opacity:u.active?1:0.55
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                  <span style={{fontSize:16}}>{ROLES[u.role]?.icon}</span>
                  <span style={{fontWeight:700,fontSize:13,color:T.text}}>{u.name}</span>
                  {u.id===currentUser.id&&<span style={{background:C.blue+"22",color:C.blue,borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:700}}>Vous</span>}
                  {!u.active&&<span style={{background:C.red+"22",color:C.red,borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:700}}>Inactif</span>}
                </div>
                <p style={{margin:0,fontSize:11,color:T.muted}}>@{u.login} · {ROLES[u.role]?.label} · depuis {u.createdAt}</p>
              </div>
              <div style={{display:"flex",gap:5,flexShrink:0,marginLeft:8}}>
                <button
                  onClick={()=>setResetPass(r=>r.id===u.id?{id:null,val:""}:{id:u.id,val:""})}
                  style={{background:C.yellow+"22",border:`1px solid ${C.yellow}44`,color:C.yellow,borderRadius:7,padding:"4px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}
                >🔑</button>
                <button
                  onClick={()=>toggleActive(u.id)}
                  style={{background:u.active?C.orange+"22":C.green+"22",border:`1px solid ${u.active?C.orange:C.green}44`,color:u.active?C.orange:C.green,borderRadius:7,padding:"4px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}
                >{u.active?"Désact.":"Activer"}</button>
                {u.id!==currentUser.id&&(
                  <button onClick={()=>deleteUser(u.id)} style={{background:C.red+"22",border:`1px solid ${C.red}44`,color:C.red,borderRadius:7,padding:"4px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>✕</button>
                )}
              </div>
            </div>

            {/* Reset password inline */}
            {resetPass.id===u.id&&(
              <div style={{marginTop:9,display:"flex",gap:7}}>
                <input style={{...inp,flex:1,marginBottom:0}} type="password" placeholder="Nouveau mot de passe"
                  value={resetPass.val} onChange={e=>setResetPass(r=>({...r,val:e.target.value}))}/>
                <button onClick={()=>handleResetPass(u.id)} style={{background:C.green,color:"#fff",border:"none",borderRadius:8,padding:"9px 12px",cursor:"pointer",fontWeight:700,fontSize:12}}>OK</button>
              </div>
            )}
          </div>
        ))}

        {/* Formulaire ajout */}
        {adding ? (
          <div style={{background:T.card2,border:`1px solid ${C.blue}`,borderRadius:12,padding:14,marginBottom:8}}>
            <p style={{margin:"0 0 11px",fontWeight:700,color:C.blue,fontSize:13}}>+ Nouveau membre du personnel</p>
            <label style={lbl}>Nom complet</label>
            <input style={inp} placeholder="Prénom Nom" value={newUser.name} onChange={e=>setNewUser(u=>({...u,name:e.target.value}))}/>
            <label style={lbl}>Identifiant de connexion</label>
            <input style={inp} placeholder="ex: marie.dupont" value={newUser.login} onChange={e=>setNewUser(u=>({...u,login:e.target.value}))}/>
            <label style={lbl}>Mot de passe initial</label>
            <input style={inp} type="password" placeholder="Min. 6 caractères" value={newUser.password} onChange={e=>setNewUser(u=>({...u,password:e.target.value}))}/>
            <label style={lbl}>Rôle</label>
            <select style={{...inp,marginBottom:12}} value={newUser.role} onChange={e=>setNewUser(u=>({...u,role:e.target.value}))}>
              {Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <div style={{display:"flex",gap:7}}>
              <button style={{flex:1,background:T.dim,color:T.text,border:"none",borderRadius:9,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:13}} onClick={()=>{setAdding(false);setError("");}}>Annuler</button>
              <button style={{flex:2,background:C.green,color:"#fff",border:"none",borderRadius:9,padding:"10px",cursor:"pointer",fontWeight:700,fontSize:13}} onClick={handleAdd}>Créer le compte</button>
            </div>
          </div>
        ) : (
          <button
            onClick={()=>setAdding(true)}
            style={{width:"100%",background:`linear-gradient(135deg,${C.blue},${C.purple})`,color:"#fff",border:"none",borderRadius:11,padding:"12px",cursor:"pointer",fontWeight:700,fontSize:14,marginTop:4}}
          >+ Ajouter un membre du personnel</button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// APP PRINCIPALE (après login)
// ══════════════════════════════════════════════════════

const HOURS = ["00","02","04","06","08","10","12","14","16","18","20","22"];
const SHIFTS = [
  {id:"matin",label:"Matin",hours:"07h-15h",color:C.blue},
  {id:"soir",label:"Soir",hours:"15h-23h",color:C.orange},
  {id:"nuit",label:"Nuit",hours:"23h-07h",color:C.purple},
];
const NORMS = {
  temp:{min:36.5,max:37.5,warn:38.5,label:"T(°C)",color:C.orange,unit:"°C"},
  ta:{min:90,max:140,warn:160,label:"TA",color:C.red,unit:"mmHg"},
  fc:{min:60,max:100,warn:120,label:"FC",color:C.pink,unit:"bpm"},
  spo2:{min:95,max:100,warn:90,label:"SpO2",color:C.blue,unit:"%"},
  fr:{min:12,max:20,warn:25,label:"FR",color:C.teal,unit:"/min"},
};
const DRUGS = [
  {name:"Paracetamol",dose:"500mg-1g",freq:"/6h",cat:"autre"},
  {name:"Amoxicilline",dose:"1g",freq:"/8h",cat:"atb"},
  {name:"Ceftriaxone",dose:"1-2g",freq:"/24h",cat:"atb"},
  {name:"Metronidazole",dose:"500mg",freq:"/8h",cat:"atb"},
  {name:"Enoxaparine",dose:"0.4ml SC",freq:"/24h",cat:"anticoag"},
  {name:"Heparine",dose:"500UI/kg/j",freq:"IV cont",cat:"anticoag"},
  {name:"Furosemide",dose:"20-40mg",freq:"/12h",cat:"autre"},
  {name:"Morphine",dose:"5-10mg",freq:"/4h",cat:"autre"},
  {name:"Omeprazole",dose:"20mg",freq:"/24h",cat:"autre"},
];
const SCORES = {
  sofa:{label:"SOFA",icon:"🦠",color:C.red,desc:"Score sepsis",fields:[
    {key:"resp",label:"PaO2/FiO2",opts:["0 - >400","1 - 300-400","2 - 200-300","3 - 100-200","4 - <100"]},
    {key:"plaq",label:"Plaquettes (G/L)",opts:["0 - >150","1 - 101-150","2 - 51-100","3 - 21-50","4 - <20"]},
    {key:"ta",label:"Hémodynamique",opts:["0 - PAM≥70","1 - PAM<70","2 - Dopamine≤5","3 - Dopamine>5","4 - Dopamine>15"]},
    {key:"gcs",label:"Glasgow",opts:["0 - 15","1 - 13-14","2 - 10-12","3 - 6-9","4 - <6"]},
    {key:"creat",label:"Créatinine",opts:["0 - <110","1 - 110-170","2 - 171-299","3 - 300-440","4 - >440"]},
  ],interpret:t=>t===0?"Mortalité <10%":t<=6?"Mortalité ~20%":t<=9?"Mortalité ~40%":"Mortalité >60%"},
  qsofa:{label:"qSOFA",icon:"⚡",color:C.orange,desc:"Dépistage sepsis",fields:[
    {key:"fr",label:"FR ≥ 22/min",opts:["0 - Non","1 - Oui"]},
    {key:"co",label:"Altération conscience",opts:["0 - Non","1 - Oui"]},
    {key:"ta",label:"TAS ≤ 100 mmHg",opts:["0 - Non","1 - Oui"]},
  ],interpret:t=>t===0?"Risque faible":t===1?"Risque modéré":"RISQUE ÉLEVÉ — Évaluation urgente"},
  glasgow:{label:"Glasgow",icon:"🧠",color:C.blue,desc:"Score de conscience",fields:[
    {key:"Y",label:"Ouverture yeux",opts:["1 - Aucune","2 - Douleur","3 - Voix","4 - Spontanée"]},
    {key:"V",label:"Réponse verbale",opts:["1 - Aucune","2 - Sons","3 - Mots","4 - Confuse","5 - Orientée"]},
    {key:"M",label:"Réponse motrice",opts:["1 - Aucune","2 - Extension","3 - Flexion","4 - Évitement","5 - Orientée","6 - Sur ordre"]},
  ],interpret:t=>t<=8?"COMA — Intubation à discuter":t<=12?"Altération modérée":"Conscience préservée"},
};
const CALCULATORS = {
  imc:{label:"IMC",icon:"⚖️",fields:[{key:"poids",label:"Poids (kg)",type:"number"},{key:"taille",label:"Taille (cm)",type:"number"}],
    calc:v=>{ const b=v.poids/Math.pow(v.taille/100,2);const cat=b<18.5?"Sous-poids":b<25?"Normal":b<30?"Surpoids":b<35?"Obésité I":"Obésité II+";return{value:b.toFixed(1),unit:"kg/m²",cat,col:b<18.5?C.blue:b<25?C.green:b<30?C.yellow:C.red};}},
  cockcroft:{label:"Clairance",icon:"🫘",fields:[{key:"age",label:"Âge",type:"number"},{key:"poids",label:"Poids (kg)",type:"number"},{key:"creat",label:"Créatinine (µmol/L)",type:"number"},{key:"sexe",label:"Sexe",type:"select",opts:["Homme","Femme"]}],
    calc:v=>{ const k=v.sexe==="Femme"?1.04:1.23;const cl=((140-v.age)*v.poids*k)/v.creat;const cat=cl>=90?"Normale":cl>=60?"Légère":cl>=30?"Modérée":cl>=15?"Sévère":"Terminale";return{value:cl.toFixed(0),unit:"mL/min",cat,col:cl>=60?C.green:cl>=30?C.yellow:C.red};}},
  debit:{label:"Débit perf.",icon:"💧",fields:[{key:"vol",label:"Volume (mL)",type:"number"},{key:"dur",label:"Durée (h)",type:"number"},{key:"fac",label:"Facteur gouttes",type:"select",opts:["20","60"]}],
    calc:v=>{ const mlh=v.vol/v.dur;const gpm=(mlh*parseInt(v.fac||20))/60;return{value:mlh.toFixed(0),unit:"mL/h",cat:`${gpm.toFixed(0)} gtt/min`,col:C.blue};}},
};

function vitalStatus(key,val){
  const n=NORMS[key];if(!n||!val)return"ok";
  const v=parseFloat(val);if(isNaN(v))return"ok";
  if(key==="spo2"){if(v<n.warn)return"critical";if(v<n.min)return"warn";return"ok";}
  if(v>n.warn||v<n.min*0.9)return"critical";
  if(v>n.max)return"warn";
  return"ok";
}

function MainApp({ currentUser, accounts, onLogout, onOpenAdmin }) {
  const [screen,setScreen]=useState("dashboard");
  const [userData,setUserData]=useState(null);
  const [saveStatus,setSaveStatus]=useState("");
  const [chatInput,setChatInput]=useState("");
  const [chatLoading,setChatLoading]=useState(false);
  const [activePatient,setActivePatient]=useState(null);
  const [ptDetail,setPtDetail]=useState(null);
  const [newPt,setNewPt]=useState({name:"",age:"",diagnosis:"",notes:"",status:"stable"});
  const [addingPt,setAddingPt]=useState(false);
  const [newAlert,setNewAlert]=useState({patientId:"",time:"",msg:""});
  const [addingAlert,setAddingAlert]=useState(false);
  const [feuillePatient,setFeuillePatient]=useState(null);
  const [feuilleDate,setFeuilleDate]=useState(new Date().toISOString().slice(0,10));
  const [feuille,setFeuille]=useState({constantes:{},entrees:[],sorties:[],meds:[],passation:{}});
  const [feuilleTab,setFeuilleTab]=useState("constantes");
  const [graphParam,setGraphParam]=useState("temp");
  const [scoreKey,setScoreKey]=useState("sofa");
  const [scoreInputs,setScoreInputs]=useState({});
  const [scoreResult,setScoreResult]=useState(null);
  const [calcKey,setCalcKey]=useState("imc");
  const [calcInputs,setCalcInputs]=useState({});
  const [calcResult,setCalcResult]=useState(null);
  const [toolTab,setToolTab]=useState("scores");
  const [now,setNow]=useState(new Date());
  const [showUserMenu,setShowUserMenu]=useState(false);
  const chatEnd=useRef(null);

  // Charger données utilisateur
  useEffect(()=>{
    (async()=>{
      const d=await loadUserData(currentUser.id);
      setUserData(d);
    })();
  },[currentUser.id]);

  useEffect(()=>{const iv=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(iv);},[]);
  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:"smooth"});},[userData?.chatHistory]);

  // Sauvegarder automatiquement
  const save = useCallback(async (newData) => {
    setSaveStatus("saving");
    await saveUserData(currentUser.id, newData);
    setSaveStatus("saved");
    setTimeout(()=>setSaveStatus(""),2000);
  },[currentUser.id]);

  const updateData = useCallback((updater) => {
    setUserData(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      save(next);
      return next;
    });
  },[save]);

  const sendChat = useCallback(async(txt)=>{
    const msg=txt||chatInput;
    if(!msg.trim()||chatLoading||!userData)return;
    const um={role:"user",content:msg};
    const hist=[...(userData.chatHistory||[]),um];
    updateData(d=>({...d,chatHistory:hist}));
    setChatInput("");
    setChatLoading(true);
    const sys=`Tu es NurseAgent expert infirmier. Service: ${userData.serviceDesc||accounts.serviceName}. ${activePatient?`Patient actif: ${activePatient.name}, ${activePatient.age}ans, ${activePatient.diagnosis}.`:""} Utilisateur: ${currentUser.name} (${ROLES[currentUser.role]?.label}). Réponds en français, de façon concise et cliniquement utile.`;
    const reply=await ai(hist,sys);
    updateData(d=>({...d,chatHistory:[...(d.chatHistory||[]),{role:"assistant",content:reply}]}));
    setChatLoading(false);
  },[chatInput,chatLoading,userData,activePatient,accounts.serviceName,currentUser,updateData]);

  const addPatient = async () => {
    if(!newPt.name.trim())return;
    const c=await ai([{role:"user",content:`Patient: ${newPt.name}, ${newPt.age}ans, diagnostic: ${newPt.diagnosis}. Conduites à tenir prioritaires?`}],"NurseAgent: liste numérotée priorisée. Français. Concis.");
    updateData(d=>({...d,patients:[...(d.patients||[]),{...newPt,id:Date.now(),conduites:c,feuilles:{},addedAt:new Date().toLocaleDateString("fr-FR"),addedBy:currentUser.name}]}));
    setNewPt({name:"",age:"",diagnosis:"",notes:"",status:"stable"});
    setAddingPt(false);
  };

  const openFeuille=(pt)=>{
    setFeuillePatient(pt);setPtDetail(null);
    const today=new Date().toISOString().slice(0,10);
    setFeuilleDate(today);
    setFeuille(pt.feuilles?.[today]||{constantes:{},entrees:[],sorties:[],meds:[],passation:{}});
    setFeuilleTab("constantes");setScreen("feuille");
  };
  const saveFeuille=()=>{
    updateData(d=>({...d,patients:d.patients.map(p=>p.id===feuillePatient.id?{...p,feuilles:{...(p.feuilles||{}),[feuilleDate]:feuille}}:p)}));
  };

  const updateConstante=(h,field,val)=>setFeuille(f=>({...f,constantes:{...f.constantes,[h]:{...(f.constantes[h]||{}),[field]:val}}}));
  const calcScore=()=>{
    const sc=SCORES[scoreKey];
    const total=sc.fields.reduce((s,f)=>s+parseInt(scoreInputs[f.key]||0),0);
    setScoreResult({total,interpret:sc.interpret(total),color:total<=2?C.green:total<=5?C.yellow:C.red});
  };
  const runCalc=()=>{try{setCalcResult(CALCULATORS[calcKey].calc(calcInputs));}catch{setCalcResult(null);}};

  if(!userData) return <LoadingScreen/>;

  const patients=userData.patients||[];
  const alerts=userData.alerts||[];
  const chatHistory=userData.chatHistory||[];
  const totalIn=feuille.entrees?.reduce((s,e)=>s+(parseFloat(e.vol)||0),0)||0;
  const totalOut=feuille.sorties?.reduce((s,e)=>s+(parseFloat(e.vol)||0),0)||0;
  const bilan=totalIn-totalOut;
  const pendingAlerts=alerts.filter(a=>!a.done);
  const urgentCount=patients.filter(p=>p.status==="urgent").length;
  const watchCount=patients.filter(p=>p.status==="watch").length;
  const chargeLevel=urgentCount>=3?"CRITIQUE":urgentCount>=1||watchCount>=3?"ÉLEVÉE":watchCount>=1?"MODÉRÉE":"NORMALE";
  const chargeColor={CRITIQUE:C.red,ÉLEVÉE:C.yellow,MODÉRÉE:C.blue,NORMALE:C.green}[chargeLevel];
  const vitalAlerts=[];
  HOURS.forEach(h=>{const c=feuille.constantes?.[h]||{};Object.entries(c).forEach(([k,v])=>{if(NORMS[k]&&vitalStatus(k,v)==="critical")vitalAlerts.push({h,param:NORMS[k].label,val:v});});});
  const chartData=HOURS.map(h=>({h:h+"h",[graphParam]:parseFloat(feuille.constantes?.[h]?.[graphParam])||null})).filter(d=>d[graphParam]!==null);

  const tabs=[
    {id:"dashboard",icon:"🏥",label:"Patients"},
    {id:"charge",icon:"📊",label:"Charge"},
    {id:"chat",icon:"💬",label:"Chat"},
    {id:"alertes",icon:"⏰",label:"Alertes",badge:pendingAlerts.length},
    {id:"outils",icon:"🧮",label:"Outils"},
  ];

  const css={
    app:{fontFamily:"'Segoe UI',sans-serif",background:T.bg,minHeight:"100vh",color:T.text,maxWidth:500,margin:"0 auto",paddingBottom:75},
    top:{background:"linear-gradient(135deg,#0a1828,#0f2040)",padding:"10px 13px",display:"flex",alignItems:"center",gap:9,position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 20px #0008",borderBottom:`1px solid ${T.border}`},
    page:{padding:13},
    card:{background:T.card,border:`1px solid ${T.border}`,borderRadius:13,padding:13,marginBottom:11},
    inp:{width:"100%",background:"#0a1220",border:`1px solid ${T.border}`,borderRadius:9,padding:"9px 12px",color:T.text,fontSize:14,boxSizing:"border-box",outline:"none"},
    ta:{width:"100%",background:"#0a1220",border:`1px solid ${T.border}`,borderRadius:9,padding:"9px 12px",color:T.text,fontSize:14,minHeight:80,resize:"vertical",boxSizing:"border-box",outline:"none"},
    btn:(c=C.blue,full=false)=>({background:c,color:"#fff",border:"none",borderRadius:9,padding:"10px 14px",cursor:"pointer",fontWeight:700,fontSize:13,width:full?"100%":"auto"}),
    lbl:{fontSize:10,color:T.dim,marginBottom:3,display:"block",fontWeight:700,textTransform:"uppercase",letterSpacing:.8},
    bot:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:500,background:T.card,borderTop:`1px solid ${T.border}`,display:"flex",zIndex:200},
    navI:(a)=>({flex:1,background:"none",border:"none",color:a?C.blue:T.dim,cursor:"pointer",padding:"7px 0 5px",display:"flex",flexDirection:"column",alignItems:"center",gap:1,fontSize:9,fontWeight:a?700:500,position:"relative"}),
    bbl:(r)=>({background:r==="user"?C.blue:T.card2,color:T.text,borderRadius:r==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"9px 13px",maxWidth:"82%",marginLeft:r==="user"?"auto":0,marginBottom:7,fontSize:13,lineHeight:1.6,border:r==="assistant"?`1px solid ${T.border}`:"none",whiteSpace:"pre-wrap"}),
    modal:{position:"fixed",inset:0,background:"#000c",zIndex:300,display:"flex",alignItems:"flex-end"},
    mbox:{background:T.card,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:500,margin:"0 auto",padding:17,maxHeight:"90vh",overflowY:"auto"},
    tab:(a,c=C.blue)=>({background:a?c:T.card2,border:`1px solid ${a?c:T.border}`,color:a?"#fff":T.muted,borderRadius:20,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}),
    Badge:({status})=>{const m={stable:[C.green,"Stable"],watch:[C.yellow,"Surv."],urgent:[C.red,"Urgent"]};const[col,lbl]=m[status]||m.stable;return<span style={{background:col+"22",color:col,border:`1px solid ${col}`,borderRadius:20,padding:"2px 8px",fontSize:11,fontWeight:700}}>{lbl}</span>;},
  };
  const {Badge}=css;

  return (
    <div style={css.app}>
      <style>{`input:focus,select:focus,textarea:focus{border-color:${C.blue}!important} @keyframes pulse{0%,100%{box-shadow:0 0 0 0 ${C.red}66}50%{box-shadow:0 0 0 10px ${C.red}00}}`}</style>

      {/* TOP BAR */}
      <div style={css.top}>
        <span style={{fontSize:20}}>🧠</span>
        <div style={{flex:1}}>
          <p style={{margin:0,fontWeight:800,color:"#fff",fontSize:14}}>NurseAgent AI</p>
          <p style={{margin:0,fontSize:10,color:C.blue}}>
            {saveStatus==="saving"?"💾 Sauvegarde...":saveStatus==="saved"?"✓ Sauvegardé":`${patients.length} patient(s) · ${now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`}
          </p>
        </div>
        {pendingAlerts.length>0&&<span style={{background:C.red,color:"#fff",borderRadius:20,padding:"2px 7px",fontSize:10,fontWeight:700}}>🔔{pendingAlerts.length}</span>}
        {/* Avatar utilisateur */}
        <button onClick={()=>setShowUserMenu(v=>!v)} style={{
          background:ROLES[currentUser.role]?.color+"22",
          border:`1px solid ${ROLES[currentUser.role]?.color}55`,
          borderRadius:20,padding:"4px 10px",cursor:"pointer",
          display:"flex",alignItems:"center",gap:5
        }}>
          <span style={{fontSize:13}}>{ROLES[currentUser.role]?.icon}</span>
          <span style={{color:T.text,fontSize:11,fontWeight:700}}>{currentUser.name.split(" ")[0]}</span>
        </button>
      </div>

      {/* USER MENU */}
      {showUserMenu&&(
        <div style={{position:"fixed",top:52,right:8,zIndex:250,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:10,minWidth:200,boxShadow:"0 8px 30px #000a"}}>
          <p style={{margin:"0 0 3px",fontWeight:700,color:T.text,fontSize:13}}>{currentUser.name}</p>
          <p style={{margin:"0 0 10px",fontSize:11,color:T.muted}}>{ROLES[currentUser.role]?.icon} {ROLES[currentUser.role]?.label}</p>
          <p style={{margin:"0 0 10px",fontSize:10,color:T.dim,borderTop:`1px solid ${T.border}`,paddingTop:7}}>@{currentUser.login} · depuis {currentUser.createdAt}</p>
          {(currentUser.role==="admin"||currentUser.role==="cadre")&&(
            <button onClick={()=>{setShowUserMenu(false);onOpenAdmin();}} style={{width:"100%",background:C.purple+"22",border:`1px solid ${C.purple}44`,color:C.purple,borderRadius:9,padding:"8px",cursor:"pointer",fontWeight:700,fontSize:12,marginBottom:7}}>
              🔑 Gérer le personnel
            </button>
          )}
          <button onClick={()=>{setShowUserMenu(false);onLogout();}} style={{width:"100%",background:C.red+"22",border:`1px solid ${C.red}44`,color:C.red,borderRadius:9,padding:"8px",cursor:"pointer",fontWeight:700,fontSize:12}}>
            ⬅️ Se déconnecter
          </button>
        </div>
      )}

      <div style={css.page}>

        {/* ── DASHBOARD ── */}
        {screen==="dashboard"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <p style={{margin:0,fontWeight:700,fontSize:15}}>Patients ({patients.length})</p>
            <button style={css.btn()} onClick={()=>setAddingPt(!addingPt)}>{addingPt?"Annuler":"+ Ajouter"}</button>
          </div>

          {addingPt&&<div style={{...css.card,border:`1px solid ${C.blue}`}}>
            {[["Nom","name","text","Nom complet"],["Âge","age","number","Âge en ans"],["Diagnostic","diagnosis","text","Diagnostic principal"]].map(([l,k,t,ph])=>(
              <div key={k} style={{marginBottom:8}}>
                <label style={css.lbl}>{l}</label>
                <input style={css.inp} type={t} placeholder={ph} value={newPt[k]} onChange={e=>setNewPt(p=>({...p,[k]:e.target.value}))}/>
              </div>
            ))}
            <label style={css.lbl}>Statut</label>
            <select style={{...css.inp,marginBottom:8}} value={newPt.status} onChange={e=>setNewPt(p=>({...p,status:e.target.value}))}>
              <option value="stable">Stable</option><option value="watch">Surveillance</option><option value="urgent">Urgent</option>
            </select>
            <label style={css.lbl}>Notes / Allergies</label>
            <textarea style={{...css.ta,minHeight:55,marginBottom:8}} placeholder="Allergies, antécédents..." value={newPt.notes} onChange={e=>setNewPt(p=>({...p,notes:e.target.value}))}/>
            <button style={css.btn(C.blue,true)} onClick={addPatient}>Ajouter et générer conduites IA</button>
          </div>}

          {patients.length===0&&!addingPt&&(
            <div style={{...css.card,textAlign:"center",padding:36}}>
              <p style={{fontSize:42}}>🧑‍⚕️</p>
              <p style={{color:T.muted,margin:"8px 0 4px",fontWeight:600}}>Aucun patient pour l'instant</p>
              <p style={{color:T.dim,fontSize:12}}>Appuyez sur « + Ajouter » pour commencer</p>
            </div>
          )}

          {[...patients].sort((a,b)=>({urgent:0,watch:1,stable:2})[a.status]-({urgent:0,watch:1,stable:2})[b.status]).map(pt=>(
            <div key={pt.id} style={{...css.card,cursor:"pointer",borderLeft:`3px solid ${pt.status==="urgent"?C.red:pt.status==="watch"?C.yellow:C.green}`}} onClick={()=>setPtDetail(pt)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <p style={{margin:"0 0 2px",fontWeight:700,fontSize:14}}>{pt.name} <span style={{color:T.muted,fontWeight:400,fontSize:12}}>{pt.age} ans</span></p>
                  <p style={{margin:"0 0 5px",color:T.muted,fontSize:12}}>{pt.diagnosis}</p>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <Badge status={pt.status}/>
                    <span style={{fontSize:10,color:T.dim}}>par {pt.addedBy}</span>
                  </div>
                </div>
                <span style={{color:T.dim,fontSize:22}}>›</span>
              </div>
            </div>
          ))}
        </>}

        {/* ── CHARGE ── */}
        {screen==="charge"&&<>
          <p style={{fontWeight:700,fontSize:15,margin:"0 0 11px"}}>📊 Tableau de Charge</p>
          <div style={{...css.card,border:`2px solid ${chargeColor}`,textAlign:"center",padding:18}}>
            <p style={{margin:"0 0 3px",fontSize:11,color:T.muted}}>Charge globale</p>
            <p style={{margin:"0 0 2px",fontSize:28,fontWeight:800,color:chargeColor}}>{chargeLevel}</p>
            <p style={{margin:0,fontSize:11,color:T.dim}}>{patients.length} patients · {now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</p>
          </div>
          <div style={{display:"flex",gap:7,marginBottom:11}}>
            {[[C.red,patients.filter(p=>p.status==="urgent").length,"Urgents"],[C.yellow,watchCount,"Surv."],[C.green,patients.filter(p=>p.status==="stable").length,"Stables"],[C.blue,pendingAlerts.length,"Alertes"]].map(([c,n,l])=>(
              <div key={l} style={{background:c+"18",border:`1px solid ${c}35`,borderRadius:11,padding:"9px 6px",flex:1,textAlign:"center"}}>
                <p style={{margin:"0 0 2px",fontSize:20,fontWeight:800,color:c}}>{n}</p>
                <p style={{margin:0,fontSize:10,color:T.muted}}>{l}</p>
              </div>
            ))}
          </div>
          {patients.length>0&&<div style={css.card}>
            <p style={{margin:"0 0 8px",fontWeight:700,fontSize:13}}>File de priorité</p>
            {[...patients].sort((a,b)=>({urgent:0,watch:1,stable:2})[a.status]-({urgent:0,watch:1,stable:2})[b.status]).map((pt,i)=>(
              <div key={pt.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:i<patients.length-1?`1px solid ${T.border}`:"none"}}>
                <span style={{fontWeight:700,color:T.dim,fontSize:12,width:22}}>#{i+1}</span>
                <div style={{flex:1}}>
                  <span style={{fontWeight:700,fontSize:13}}>{pt.name}</span>
                  <span style={{color:T.dim,fontSize:12,marginLeft:6}}>{pt.diagnosis}</span>
                </div>
                <Badge status={pt.status}/>
              </div>
            ))}
          </div>}
        </>}

        {/* ── CHAT ── */}
        {screen==="chat"&&<>
          {activePatient&&(
            <div style={{background:C.blue+"12",border:`1px solid ${C.blue}`,borderRadius:9,padding:"6px 12px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,color:C.blue,fontWeight:700}}>👤 {activePatient.name}</span>
              <button style={{background:"none",border:"none",color:T.dim,cursor:"pointer",fontSize:16}} onClick={()=>setActivePatient(null)}>✕</button>
            </div>
          )}
          {!activePatient&&patients.length>0&&(
            <div style={{marginBottom:8,overflowX:"auto",display:"flex",gap:6,paddingBottom:2}}>
              {patients.map(pt=>(
                <button key={pt.id} style={{background:T.card2,border:`1px solid ${T.border}`,color:T.muted,borderRadius:20,padding:"4px 11px",cursor:"pointer",whiteSpace:"nowrap",fontSize:12}} onClick={()=>setActivePatient(pt)}>{pt.name}</button>
              ))}
            </div>
          )}
          <div style={{background:T.bg,borderRadius:11,padding:11,height:330,overflowY:"auto",marginBottom:9,border:`1px solid ${T.border}`}}>
            {chatHistory.length===0&&(
              <div style={{textAlign:"center",marginTop:40,color:T.dim}}>
                <p style={{fontSize:36}}>💬</p>
                <p style={{fontSize:13,color:T.muted,margin:"8px 0 12px"}}>Posez vos questions cliniques</p>
                <div style={{textAlign:"left",background:T.card,borderRadius:9,padding:10,fontSize:12,color:T.muted}}>
                  {["Conduite à tenir sepsis","Protocole transfusion","Doses pédiatriques paracétamol","Interprétation bilan rénal"].map(s=>(
                    <p key={s} style={{margin:"4px 0",cursor:"pointer",color:C.blue,fontWeight:600}} onClick={()=>sendChat(s)}>• {s}</p>
                  ))}
                </div>
              </div>
            )}
            {chatHistory.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={css.bbl(m.role)}>
                  {m.role==="assistant"&&<span style={{fontSize:10,color:C.blue,fontWeight:700}}>NurseAgent IA{"\n"}</span>}
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading&&<div style={css.bbl("assistant")}><span style={{fontSize:10,color:C.blue,fontWeight:700}}>NurseAgent IA{"\n"}</span><span style={{color:T.muted}}>Analyse en cours...</span></div>}
            <div ref={chatEnd}/>
          </div>
          <div style={{display:"flex",gap:7}}>
            <input style={{...css.inp,flex:1}} placeholder="Votre question clinique..." value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()}/>
            <button style={{...css.btn(),padding:"10px 14px"}} onClick={()=>sendChat()} disabled={chatLoading}>➤</button>
          </div>
          {chatHistory.length>0&&(
            <button style={{marginTop:7,...css.btn(T.dim,true),fontSize:11,padding:"6px"}} onClick={()=>updateData(d=>({...d,chatHistory:[]}))}>Effacer la conversation</button>
          )}
        </>}

        {/* ── ALERTES ── */}
        {screen==="alertes"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <p style={{margin:0,fontWeight:700,fontSize:15}}>⏰ Alertes & Rappels</p>
            <button style={css.btn()} onClick={()=>setAddingAlert(!addingAlert)}>{addingAlert?"Annuler":"+ Ajouter"}</button>
          </div>
          {addingAlert&&(
            <div style={{...css.card,border:`1px solid ${C.blue}`}}>
              <label style={css.lbl}>Patient (optionnel)</label>
              <select style={{...css.inp,marginBottom:8}} value={newAlert.patientId} onChange={e=>setNewAlert(a=>({...a,patientId:e.target.value}))}>
                <option value="">Service général</option>
                {patients.map(pt=><option key={pt.id} value={pt.id}>{pt.name}</option>)}
              </select>
              <label style={css.lbl}>Heure</label>
              <input style={{...css.inp,marginBottom:8}} type="time" value={newAlert.time} onChange={e=>setNewAlert(a=>({...a,time:e.target.value}))}/>
              <label style={css.lbl}>Action à effectuer</label>
              <input style={{...css.inp,marginBottom:8}} placeholder="Constantes, pansement, médicament..." value={newAlert.msg} onChange={e=>setNewAlert(a=>({...a,msg:e.target.value}))}/>
              <button style={css.btn(C.blue,true)} onClick={()=>{
                if(!newAlert.msg.trim()||!newAlert.time)return;
                updateData(d=>({...d,alerts:[...(d.alerts||[]),{id:Date.now(),...newAlert,done:false}]}));
                setNewAlert({patientId:"",time:"",msg:""});setAddingAlert(false);
              }}>Créer l'alerte</button>
            </div>
          )}
          {pendingAlerts.length===0&&!addingAlert&&(
            <div style={{...css.card,textAlign:"center",padding:28}}>
              <p style={{fontSize:34}}>✅</p>
              <p style={{color:T.muted,fontSize:13}}>Aucune alerte en attente</p>
            </div>
          )}
          {[...pendingAlerts].sort((a,b)=>a.time.localeCompare(b.time)).map(al=>{
            const pt=patients.find(p=>String(p.id)===String(al.patientId));
            const isPast=al.time&&al.time<now.toTimeString().slice(0,5);
            return(
              <div key={al.id} style={{...css.card,borderLeft:`3px solid ${isPast?C.red:C.yellow}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <p style={{margin:"0 0 2px",fontWeight:700,fontSize:13,color:isPast?C.red:T.text}}>{isPast?"🚨 ":""}{al.time} — {al.msg}</p>
                    {pt&&<p style={{margin:0,fontSize:12,color:T.muted}}>👤 {pt.name}</p>}
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <button style={{...css.btn(C.green),padding:"5px 9px",fontSize:11}} onClick={()=>updateData(d=>({...d,alerts:d.alerts.map(x=>x.id===al.id?{...x,done:true}:x)}))}>✓</button>
                    <button style={{...css.btn(C.red),padding:"5px 9px",fontSize:11}} onClick={()=>updateData(d=>({...d,alerts:d.alerts.filter(x=>x.id!==al.id)}))}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}
        </>}

        {/* ── OUTILS ── */}
        {screen==="outils"&&<>
          <p style={{fontWeight:700,fontSize:15,margin:"0 0 10px"}}>🧮 Outils Cliniques</p>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            {[["scores","Scores"],["calcul","Calculs"]].map(([k,l])=>(
              <button key={k} onClick={()=>setToolTab(k)} style={{...css.tab(toolTab===k),flex:1,textAlign:"center"}}>{l}</button>
            ))}
          </div>
          {toolTab==="scores"&&<>
            <div style={{display:"flex",gap:4,marginBottom:10,overflowX:"auto",paddingBottom:2}}>
              {Object.entries(SCORES).map(([k,s])=>(
                <button key={k} onClick={()=>{setScoreKey(k);setScoreInputs({});setScoreResult(null);}} style={css.tab(scoreKey===k,s.color)}>{s.icon} {s.label}</button>
              ))}
            </div>
            {(()=>{ const sc=SCORES[scoreKey]; return(
              <div style={{...css.card,border:`1px solid ${sc.color}`}}>
                <p style={{margin:"0 0 3px",fontWeight:700,fontSize:14,color:sc.color}}>{sc.icon} {sc.label}</p>
                <p style={{margin:"0 0 10px",fontSize:12,color:T.muted}}>{sc.desc}</p>
                {sc.fields.map(f=>(
                  <div key={f.key} style={{marginBottom:9}}>
                    <label style={css.lbl}>{f.label}</label>
                    <select style={css.inp} value={scoreInputs[f.key]||""} onChange={e=>setScoreInputs(v=>({...v,[f.key]:e.target.value}))}>
                      <option value="">Sélectionner...</option>
                      {f.opts.map(o=><option key={o} value={parseInt(o)}>{o}</option>)}
                    </select>
                  </div>
                ))}
                <button style={{...css.btn(sc.color,true),marginBottom:scoreResult?11:0}} onClick={calcScore}>Calculer</button>
                {scoreResult&&(
                  <div style={{background:scoreResult.color+"18",border:`2px solid ${scoreResult.color}`,borderRadius:10,padding:13,textAlign:"center"}}>
                    <p style={{margin:"0 0 5px",fontSize:38,fontWeight:800,color:scoreResult.color}}>{scoreResult.total}</p>
                    <p style={{margin:"0 0 8px",fontSize:13}}>{scoreResult.interpret}</p>
                    <button style={{...css.btn(C.blue),fontSize:12}} onClick={()=>{setScreen("chat");sendChat(`Score ${sc.label} = ${scoreResult.total}. ${scoreResult.interpret}. Quelle conduite à tenir ?`);}}>
                      Demander à l'IA →
                    </button>
                  </div>
                )}
              </div>
            );})()}
          </>}
          {toolTab==="calcul"&&<>
            <div style={{display:"flex",gap:4,marginBottom:10,overflowX:"auto",paddingBottom:2}}>
              {Object.entries(CALCULATORS).map(([k,c])=>(
                <button key={k} onClick={()=>{setCalcKey(k);setCalcInputs({});setCalcResult(null);}} style={css.tab(calcKey===k)}>{c.icon} {c.label}</button>
              ))}
            </div>
            {(()=>{ const calc=CALCULATORS[calcKey]; return(
              <div style={{...css.card,border:`1px solid ${C.blue}`}}>
                <p style={{margin:"0 0 11px",fontWeight:700,fontSize:14,color:C.blue}}>{calc.icon} {calc.label}</p>
                {calc.fields.map(f=>(
                  <div key={f.key} style={{marginBottom:9}}>
                    <label style={css.lbl}>{f.label}</label>
                    {f.type==="select"
                      ? <select style={css.inp} value={calcInputs[f.key]||""} onChange={e=>setCalcInputs(v=>({...v,[f.key]:e.target.value}))}><option value="">Sélectionner...</option>{f.opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
                      : <input style={css.inp} type="number" placeholder="0" value={calcInputs[f.key]||""} onChange={e=>setCalcInputs(v=>({...v,[f.key]:e.target.value}))}/>
                    }
                  </div>
                ))}
                <button style={{...css.btn(C.blue,true),marginBottom:calcResult?11:0}} onClick={runCalc}>Calculer</button>
                {calcResult&&(
                  <div style={{background:calcResult.col+"18",border:`2px solid ${calcResult.col}`,borderRadius:10,padding:13,textAlign:"center"}}>
                    <p style={{margin:"0 0 4px",fontSize:34,fontWeight:800,color:calcResult.col}}>{calcResult.value} <span style={{fontSize:14}}>{calcResult.unit}</span></p>
                    <p style={{margin:0,fontSize:13,fontWeight:700,color:calcResult.col}}>{calcResult.cat}</p>
                  </div>
                )}
              </div>
            );})()}
          </>}
        </>}

        {/* ── FEUILLE 24H ── */}
        {screen==="feuille"&&feuillePatient&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
            <div>
              <p style={{margin:0,fontWeight:700,fontSize:14}}>📋 Feuille 24h</p>
              <p style={{margin:0,fontSize:12,color:T.muted}}>{feuillePatient.name}</p>
            </div>
            <div style={{display:"flex",gap:5}}>
              <button style={css.btn(C.green)} onClick={saveFeuille}>💾 Sauv.</button>
              <button style={css.btn(T.dim)} onClick={()=>setScreen("dashboard")}>← Retour</button>
            </div>
          </div>
          {vitalAlerts.length>0&&(
            <div style={{background:C.red+"18",border:`1px solid ${C.red}`,borderRadius:9,padding:9,marginBottom:9}}>
              <p style={{margin:"0 0 4px",fontWeight:700,fontSize:12,color:C.red}}>🚨 Valeurs critiques :</p>
              {vitalAlerts.map((a,i)=><p key={i} style={{margin:"2px 0",fontSize:12,color:C.red}}>• {a.h}h {a.param}: {a.val}</p>)}
            </div>
          )}
          <input style={{...css.inp,marginBottom:9}} type="date" value={feuilleDate} onChange={e=>{setFeuilleDate(e.target.value);setFeuille(feuillePatient.feuilles?.[e.target.value]||{constantes:{},entrees:[],sorties:[],meds:[],passation:{}});}}/>
          <div style={{display:"flex",gap:4,marginBottom:11,overflowX:"auto"}}>
            {[["constantes","Constantes"],["graphiques","Courbes"],["bilans","Bilan H."],["prescriptions","Rx"],["passation","Passation"]].map(([id,lbl])=>(
              <button key={id} onClick={()=>setFeuilleTab(id)} style={css.tab(feuilleTab===id)}>{lbl}</button>
            ))}
          </div>

          {feuilleTab==="constantes"&&(
            <div style={{...css.card,borderTop:`3px solid ${C.blue}`,overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",fontSize:11,minWidth:340}}>
                <thead><tr style={{background:C.blue+"22"}}>{["H","T°","TA","FC","SpO2","FR"].map(h=><th key={h} style={{padding:"5px 3px",textAlign:"center",color:C.blue,fontWeight:700}}>{h}</th>)}</tr></thead>
                <tbody>{HOURS.map(h=>{
                  const c=feuille.constantes?.[h]||{};
                  return<tr key={h} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:"3px",textAlign:"center",fontWeight:700,color:T.dim,fontSize:10}}>{h}</td>
                    {["temp","ta","fc","spo2","fr"].map(f=>{
                      const st=vitalStatus(f,c[f]);
                      const bg=st==="critical"?C.red+"30":st==="warn"?C.yellow+"20":"transparent";
                      return<td key={f} style={{padding:"2px 1px",background:bg}}>
                        <input style={{width:42,background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 2px",color:st==="critical"?C.red:T.text,fontSize:11,textAlign:"center"}}
                          value={c[f]||""} onChange={e=>updateConstante(h,f,e.target.value)} placeholder="-"/>
                      </td>;
                    })}
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}

          {feuilleTab==="graphiques"&&(
            <div style={{...css.card,borderTop:`3px solid ${C.purple}`}}>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
                {Object.entries(NORMS).map(([k,n])=><button key={k} onClick={()=>setGraphParam(k)} style={css.tab(graphParam===k,n.color)}>{n.label}</button>)}
              </div>
              {chartData.length>1
                ? <ResponsiveContainer width="100%" height={190}>
                    <LineChart data={chartData} margin={{top:5,right:10,left:-20,bottom:5}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                      <XAxis dataKey="h" stroke={T.dim} fontSize={10}/>
                      <YAxis stroke={T.dim} fontSize={10}/>
                      <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,fontSize:12,borderRadius:8}}/>
                      <ReferenceLine y={NORMS[graphParam]?.max} stroke={C.yellow} strokeDasharray="4 4"/>
                      <ReferenceLine y={NORMS[graphParam]?.min} stroke={C.blue} strokeDasharray="4 4"/>
                      <Line type="monotone" dataKey={graphParam} stroke={NORMS[graphParam]?.color} strokeWidth={2} dot={{r:4}} connectNulls/>
                    </LineChart>
                  </ResponsiveContainer>
                : <p style={{color:T.dim,textAlign:"center",padding:24}}>Saisissez au moins 2 valeurs de constantes.</p>
              }
            </div>
          )}

          {feuilleTab==="bilans"&&(
            <div style={{...css.card,borderTop:`3px solid ${C.teal}`}}>
              <div style={{display:"flex",gap:7,marginBottom:10}}>
                {[[C.green,totalIn,"Entrées"],[C.red,totalOut,"Sorties"],[bilan>=0?C.green:C.red,`${bilan>=0?"+":""}${bilan}`,"Bilan"]].map(([c,n,l])=>(
                  <div key={l} style={{flex:1,background:c+"15",border:`1px solid ${c}35`,borderRadius:9,padding:9,textAlign:"center"}}>
                    <p style={{margin:"0 0 1px",fontSize:10,color:T.dim}}>{l}</p>
                    <p style={{margin:0,fontWeight:800,fontSize:18,color:c}}>{n}</p>
                  </div>
                ))}
              </div>
              <p style={{margin:"0 0 5px",fontSize:11,color:C.green,fontWeight:700}}>ENTRÉES</p>
              {(feuille.entrees||[]).map(e=>(
                <div key={e.id} style={{display:"flex",gap:4,marginBottom:4}}>
                  <input style={{...css.inp,width:44,fontSize:12}} placeholder="hh" value={e.time} onChange={ev=>setFeuille(f=>({...f,entrees:f.entrees.map(x=>x.id===e.id?{...x,time:ev.target.value}:x)}))}/>
                  <input style={{...css.inp,flex:1,fontSize:12}} placeholder="Type" value={e.type} onChange={ev=>setFeuille(f=>({...f,entrees:f.entrees.map(x=>x.id===e.id?{...x,type:ev.target.value}:x)}))}/>
                  <input style={{...css.inp,width:56,fontSize:12}} placeholder="mL" type="number" value={e.vol} onChange={ev=>setFeuille(f=>({...f,entrees:f.entrees.map(x=>x.id===e.id?{...x,vol:ev.target.value}:x)}))}/>
                  <button style={{...css.btn(C.red),padding:"4px 7px",fontSize:12}} onClick={()=>setFeuille(f=>({...f,entrees:f.entrees.filter(x=>x.id!==e.id)}))}>✕</button>
                </div>
              ))}
              <button style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,color:T.muted,borderRadius:8,padding:"7px",cursor:"pointer",fontSize:11,marginBottom:10}} onClick={()=>setFeuille(f=>({...f,entrees:[...(f.entrees||[]),{id:Date.now(),time:"",type:"",vol:""}]}))}>+ Entrée</button>
              <p style={{margin:"0 0 5px",fontSize:11,color:C.red,fontWeight:700}}>SORTIES</p>
              {(feuille.sorties||[]).map(s=>(
                <div key={s.id} style={{display:"flex",gap:4,marginBottom:4}}>
                  <input style={{...css.inp,width:44,fontSize:12}} placeholder="hh" value={s.time} onChange={ev=>setFeuille(f=>({...f,sorties:f.sorties.map(x=>x.id===s.id?{...x,time:ev.target.value}:x)}))}/>
                  <input style={{...css.inp,flex:1,fontSize:12}} placeholder="Type" value={s.type} onChange={ev=>setFeuille(f=>({...f,sorties:f.sorties.map(x=>x.id===s.id?{...x,type:ev.target.value}:x)}))}/>
                  <input style={{...css.inp,width:56,fontSize:12}} placeholder="mL" type="number" value={s.vol} onChange={ev=>setFeuille(f=>({...f,sorties:f.sorties.map(x=>x.id===s.id?{...x,vol:ev.target.value}:x)}))}/>
                  <button style={{...css.btn(C.red),padding:"4px 7px",fontSize:12}} onClick={()=>setFeuille(f=>({...f,sorties:f.sorties.filter(x=>x.id!==s.id)}))}>✕</button>
                </div>
              ))}
              <button style={{width:"100%",background:T.card2,border:`1px solid ${T.border}`,color:T.muted,borderRadius:8,padding:"7px",cursor:"pointer",fontSize:11}} onClick={()=>setFeuille(f=>({...f,sorties:[...(f.sorties||[]),{id:Date.now(),time:"",type:"",vol:""}]}))}>+ Sortie</button>
            </div>
          )}

          {feuilleTab==="prescriptions"&&(
            <div style={{...css.card,borderTop:`3px solid ${C.blue}`}}>
              {(feuille.meds||[]).map((m,i)=>{
                const mc=m.cat==="atb"?C.green:m.cat==="anticoag"?C.red:C.blue;
                return<div key={i} style={{background:mc+"12",border:`1px solid ${mc}35`,borderRadius:8,padding:"8px 11px",marginBottom:6,display:"flex",alignItems:"center",gap:7}}>
                  <span style={{color:mc,fontWeight:700,fontSize:13,flex:1}}>{m.name}</span>
                  <span style={{color:T.muted,fontSize:12}}>{m.dose} {m.freq}</span>
                  <button style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14}} onClick={()=>setFeuille(f=>({...f,meds:f.meds.filter((_,j)=>j!==i)}))}>✕</button>
                </div>;
              })}
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:8}}>
                {DRUGS.map(d=>(
                  <button key={d.name} onClick={()=>setFeuille(f=>({...f,meds:[...(f.meds||[]),{...d,id:Date.now()}]}))}
                    style={{background:d.cat==="atb"?C.green+"22":d.cat==="anticoag"?C.red+"22":T.card2,border:`1px solid ${d.cat==="atb"?C.green:d.cat==="anticoag"?C.red:T.border}`,color:d.cat==="atb"?C.green:d.cat==="anticoag"?C.red:T.muted,borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:600}}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {feuilleTab==="passation"&&(
            <div style={{...css.card,borderTop:`3px solid ${C.orange}`}}>
              {SHIFTS.map(sh=>(
                <div key={sh.id} style={{background:sh.color+"10",border:`1px solid ${sh.color}35`,borderRadius:10,padding:10,marginBottom:9}}>
                  <p style={{margin:"0 0 8px",fontWeight:700,fontSize:13,color:sh.color}}>{sh.label} {sh.hours}</p>
                  <label style={css.lbl}>Infirmier(e)</label>
                  <input style={{...css.inp,marginBottom:6}} value={feuille.passation?.[sh.id]?.infirmier||""} onChange={e=>setFeuille(f=>({...f,passation:{...f.passation,[sh.id]:{...(f.passation?.[sh.id]||{}),[  "infirmier"]:e.target.value}}}))}/>
                  <label style={css.lbl}>Transmissions</label>
                  <textarea style={{...css.ta,minHeight:55,marginBottom:6}} value={feuille.passation?.[sh.id]?.observation||""} onChange={e=>setFeuille(f=>({...f,passation:{...f.passation,[sh.id]:{...(f.passation?.[sh.id]||{}),observation:e.target.value}}}))}/>
                  <label style={css.lbl}>Signature</label>
                  <input style={css.inp} value={feuille.passation?.[sh.id]?.signature||""} onChange={e=>setFeuille(f=>({...f,passation:{...f.passation,[sh.id]:{...(f.passation?.[sh.id]||{}),signature:e.target.value}}}))}/>
                </div>
              ))}
            </div>
          )}
        </>}

      </div>

      {/* PATIENT DETAIL MODAL */}
      {ptDetail&&(
        <div style={css.modal} onClick={()=>setPtDetail(null)}>
          <div style={css.mbox} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}>
              <p style={{margin:0,fontWeight:800,fontSize:16}}>{ptDetail.name}</p>
              <button style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:22}} onClick={()=>setPtDetail(null)}>✕</button>
            </div>
            <div style={{display:"flex",gap:7,marginBottom:9,alignItems:"center"}}>
              <Badge status={ptDetail.status}/>
              <span style={{color:T.muted,fontSize:13}}>{ptDetail.age} ans · {ptDetail.diagnosis}</span>
            </div>
            {ptDetail.conduites&&(
              <div style={{background:T.bg,borderRadius:9,padding:10,marginBottom:12,border:`1px solid ${T.border}`}}>
                <p style={{margin:"0 0 5px",fontSize:11,color:C.blue,fontWeight:700}}>CONDUITES IA :</p>
                <p style={{margin:0,fontSize:12,color:T.muted,whiteSpace:"pre-wrap",lineHeight:1.6}}>{ptDetail.conduites}</p>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button style={css.btn(C.teal,true)} onClick={()=>openFeuille(ptDetail)}>📋 Feuille de Surveillance 24h</button>
              <button style={css.btn(C.purple,true)} onClick={()=>{setActivePatient(ptDetail);setPtDetail(null);setScreen("chat");setChatHistory&&updateData(d=>({...d,chatHistory:[{role:"assistant",content:`Prêt pour ${ptDetail.name}, ${ptDetail.age}ans — ${ptDetail.diagnosis}.`}]}));}}>💬 Chat IA contextuel</button>
              <button style={css.btn(C.yellow,true)} onClick={()=>{setNewAlert({patientId:String(ptDetail.id),time:"",msg:""});setPtDetail(null);setScreen("alertes");setAddingAlert(true);}}>⏰ Créer une alerte</button>
              {/* Changement de statut inline */}
              <div style={{display:"flex",gap:6}}>
                {["stable","watch","urgent"].map(s=>(
                  <button key={s} onClick={()=>{updateData(d=>({...d,patients:d.patients.map(p=>p.id===ptDetail.id?{...p,status:s}:p)}));setPtDetail(p=>({...p,status:s}));}}
                    style={{flex:1,background:ptDetail.status===s?({stable:C.green,watch:C.yellow,urgent:C.red}[s])+"44":T.card2,border:`1px solid ${({stable:C.green,watch:C.yellow,urgent:C.red}[s])}44`,color:({stable:C.green,watch:C.yellow,urgent:C.red}[s]),borderRadius:9,padding:"9px",cursor:"pointer",fontWeight:700,fontSize:12}}>
                    {s==="stable"?"Stable":s==="watch"?"Surv.":"Urgent"}
                  </button>
                ))}
              </div>
              <button style={{...css.btn(C.red,true),marginTop:4}} onClick={()=>{updateData(d=>({...d,patients:d.patients.filter(x=>x.id!==ptDetail.id)}));setPtDetail(null);}}>🗑️ Supprimer le patient</button>
            </div>
          </div>
        </div>
      )}

      {/* NAV BAR */}
      <div style={css.bot}>
        {tabs.map(t=>(
          <button key={t.id}
            style={css.navI(screen===t.id||(screen==="feuille"&&t.id==="dashboard"))}
            onClick={()=>setScreen(t.id)}
          >
            <span style={{fontSize:18}}>{t.icon}</span>
            <span style={{fontSize:8}}>{t.label}</span>
            {(t.badge||0)>0&&<span style={{position:"absolute",top:3,right:"50%",transform:"translateX(80%)",background:C.red,color:"#fff",borderRadius:20,padding:"1px 5px",fontSize:8,fontWeight:700}}>{t.badge}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ROOT — Gestion des états globaux
// ══════════════════════════════════════════════════════
export default function App() {
  const [appState, setAppState] = useState("loading"); // loading | setup | login | app
  const [accounts, setAccounts] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(()=>{
    (async()=>{
      const acc = await loadAccounts();
      if (!acc) { setAppState("setup"); }
      else { setAccounts(acc); setAppState("login"); }
    })();
  },[]);

  const handleSetupComplete = (acc) => { setAccounts(acc); setAppState("login"); };
  const handleLogin = (user) => { setCurrentUser(user); setAppState("app"); };
  const handleLogout = () => { setCurrentUser(null); setAppState("login"); };
  const handleAccountsUpdate = (newAcc) => { setAccounts(newAcc); };

  if (appState==="loading") return <LoadingScreen/>;
  if (appState==="setup")   return <SetupScreen onComplete={handleSetupComplete}/>;
  if (appState==="login")   return <LoginScreen accounts={accounts} onLogin={handleLogin}/>;

  return (
    <>
      <MainApp
        currentUser={currentUser}
        accounts={accounts}
        onLogout={handleLogout}
        onOpenAdmin={()=>setShowAdmin(true)}
      />
      {showAdmin && (currentUser.role==="admin"||currentUser.role==="cadre") && (
        <AdminPanel
          accounts={accounts}
          currentUser={currentUser}
          onUpdate={handleAccountsUpdate}
          onClose={()=>setShowAdmin(false)}
        />
      )}
    </>
  );
}
