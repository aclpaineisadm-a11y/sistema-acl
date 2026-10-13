/* Sistema ACL · ponte com o banco de dados (Supabase).
   Oferece ao sistema a mesma interface que ele usava (window.claude.use),
   com login, tempo real, arquivos e downloads. */
(function(){
"use strict";
const CFG=window.ACL_CFG;
const sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
window.SB=sb;
window.BLOB_BASE=CFG.url+"/storage/v1/object/public/arquivos/";

const split=p=>{const i=String(p).lastIndexOf("/");return{col:p.slice(0,i),id:p.slice(i+1)}};
const rid=()=>{const c="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";const a=crypto.getRandomValues(new Uint8Array(20));let s="";a.forEach(x=>s+=c[x%62]);return s};
const clone=o=>o==null?o:JSON.parse(JSON.stringify(o));
const limpa=o=>JSON.parse(JSON.stringify(o==null?{}:o));
function erro(e){const m=String((e&&(e.message||e.details))||e||"");const code=(e&&e.code)||"";
  const out=new Error(m||"erro");
  if(code==="42501"||/row-level security|permission denied/i.test(m))out.code="invalid_argument";
  else if(code==="P0002"||/inexistente/.test(m))out.code="not_found";
  else if(/Failed to fetch|NetworkError|network/i.test(m))out.code="unavailable";
  else out.code=code||"erro";
  return out}

/* ---------- login ---------- */
let sessao=null,perfil=null,liberar;const pronto=new Promise(r=>liberar=r);
function telaLogin(msg){
  let el=document.getElementById("acl-login");
  if(!el){el=document.createElement("div");el.id="acl-login";document.body.appendChild(el)}
  el.innerHTML=`<style>#acl-login{position:fixed;inset:0;z-index:9999;background:#eef1f4;display:flex;align-items:center;justify-content:center;padding:16px;font-family:"IBM Plex Sans",system-ui,sans-serif;color:#17212b}
  #acl-login .bx{background:#fff;border:1px solid #d6dce3;border-radius:10px;padding:26px;width:100%;max-width:380px;display:flex;flex-direction:column;gap:12px;box-shadow:0 10px 30px rgba(0,0,0,.08)}
  #acl-login h1{font-family:"Barlow Condensed",sans-serif;font-size:1.7rem;margin:0;letter-spacing:.02em}#acl-login .sq{display:inline-block;width:14px;height:14px;background:#f2b705;border-radius:3px;margin-right:8px}
  #acl-login label{display:flex;flex-direction:column;gap:4px;font-size:.85rem;color:#5a6572}#acl-login input{font:inherit;font-size:1rem;padding:10px 12px;border:1px solid #d6dce3;border-radius:6px;color:#17212b}
  #acl-login button{font:inherit;font-weight:600;padding:11px;border-radius:6px;border:1px solid #d6dce3;background:#fff;cursor:pointer}#acl-login button.p{background:#f2b705;border-color:#f2b705}
  #acl-login .m{font-size:.85rem;color:#b3261e;min-height:1em}#acl-login .m.ok{color:#1d7a3e}#acl-login .lk{background:none;border:none;color:#5a6572;text-decoration:underline;padding:2px;font-weight:400}
  @media (prefers-color-scheme:dark){#acl-login{background:#0f141a;color:#e6ebf0}#acl-login .bx{background:#17202a;border-color:#2a3644}#acl-login input{background:#0f141a;border-color:#2a3644;color:#e6ebf0}#acl-login button{background:#17202a;color:#e6ebf0;border-color:#2a3644}#acl-login button.p{color:#17212b}}</style>
  <form class="bx" id="acl-lf"><h1><span class="sq"></span>SISTEMA ACL</h1>
  <div id="acl-modo" data-m="entrar"></div>
  <label id="acl-nw" hidden>Seu nome<input id="acl-nome" autocomplete="name"></label>
  <label>E-mail<input id="acl-email" type="email" autocomplete="email" required></label>
  <label id="acl-pw">Senha<input id="acl-senha" type="password" autocomplete="current-password" minlength="6"></label>
  <div class="m" id="acl-msg">${msg||""}</div>
  <button class="p" type="submit" id="acl-go">Entrar</button>
  <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px"><button type="button" class="lk" id="acl-novo">Primeiro acesso: criar minha senha</button><button type="button" class="lk" id="acl-esq">Esqueci a senha</button></div></form>`;
  const $=s=>document.getElementById(s);let modo="entrar";
  const set=m=>{modo=m;$("acl-nw").hidden=m!=="criar";$("acl-pw").hidden=m==="esqueci";$("acl-go").textContent=m==="criar"?"Criar acesso":m==="esqueci"?"Enviar link para o e-mail":"Entrar";$("acl-senha").autocomplete=m==="criar"?"new-password":"current-password";$("acl-msg").textContent="";$("acl-msg").className="m"};
  $("acl-novo").onclick=()=>set(modo==="criar"?"entrar":"criar");$("acl-esq").onclick=()=>set(modo==="esqueci"?"entrar":"esqueci");
  $("acl-lf").onsubmit=async e=>{e.preventDefault();const em=$("acl-email").value.trim(),pw=$("acl-senha").value;const ms=$("acl-msg");ms.className="m";ms.textContent="Aguarde…";
    try{if(modo==="esqueci"){const{error}=await sb.auth.resetPasswordForEmail(em,{redirectTo:location.href.split("#")[0]});if(error)throw error;ms.className="m ok";ms.textContent="Enviamos um link para "+em+". Abra o e-mail e siga as instruções.";return}
      if(!pw||pw.length<6){ms.textContent="A senha precisa ter pelo menos 6 caracteres.";return}
      if(modo==="criar"){const{data,error}=await sb.auth.signUp({email:em,password:pw,options:{data:{nome:$("acl-nome").value.trim()},emailRedirectTo:location.href.split("#")[0]}});if(error)throw error;
        if(!data.session){ms.className="m ok";ms.textContent="Acesso criado. Confirme pelo link enviado para "+em+" e depois entre aqui.";set("entrar");$("acl-msg").className="m ok";$("acl-msg").textContent="Confirme o e-mail e depois entre com sua senha.";return}}
      else{const{error}=await sb.auth.signInWithPassword({email:em,password:pw});if(error)throw error}
    }catch(err){ms.className="m";const t=String(err.message||err);ms.textContent=/Invalid login/i.test(t)?"E-mail ou senha incorretos.":/Email not confirmed/i.test(t)?"Confirme seu e-mail pelo link que enviamos antes de entrar.":/already registered/i.test(t)?"Este e-mail já tem acesso. Use Entrar.":"Não foi possível: "+t}};
  if(location.hash.includes("type=recovery")){set("entrar");$("acl-msg").className="m ok";$("acl-msg").textContent="Digite a nova senha e clique em Entrar."}
}
async function carregaPerfil(){for(let k=0;k<5;k++){const{data}=await sb.from("perfis").select("*").eq("id",sessao.user.id).maybeSingle();if(data){perfil=data;return}await new Promise(r=>setTimeout(r,600))}perfil={id:sessao.user.id,nome:sessao.user.email,admin:false}}
let iniciado=false;
async function aoEntrar(s){sessao=s;if(iniciado)return;iniciado=true;await carregaPerfil();const el=document.getElementById("acl-login");if(el)el.remove();botaoSair();liberar();iniciaLeituras()}
sb.auth.onAuthStateChange(async(ev,s)=>{if(ev==="PASSWORD_RECOVERY"){const np=prompt("Digite a nova senha (mínimo 6 caracteres):");if(np&&np.length>=6){const{error}=await sb.auth.updateUser({password:np});alert(error?"Não foi possível trocar a senha: "+error.message:"Senha alterada.")}}
  if(s&&!sessao)aoEntrar(s);if(!s&&sessao){location.reload()}});
document.addEventListener("DOMContentLoaded",async()=>{const{data}=await sb.auth.getSession();if(data.session)aoEntrar(data.session);else telaLogin()});
function botaoSair(){const b=document.createElement("button");b.id="acl-sair";b.type="button";b.textContent="Sair ("+((perfil&&perfil.nome)||sessao.user.email)+")";
  b.style.cssText="position:fixed;left:10px;bottom:10px;z-index:60;font:12px system-ui,sans-serif;padding:5px 9px;border-radius:5px;border:1px solid #c9d1da;background:rgba(255,255,255,.9);color:#5a6572;cursor:pointer";
  b.onclick=async()=>{if(confirm("Sair do sistema neste aparelho?")){await sb.auth.signOut();location.reload()}};document.body.appendChild(b);
  const st=document.createElement("style");st.textContent="body.tv #acl-sair{display:none}";document.head.appendChild(st)}

/* ---------- banco: coleções em cache, atualizadas em tempo real ---------- */
const COL={};let canal=null;
function emit(st){if(st.pend)return;st.pend=true;queueMicrotask(()=>{st.pend=false;st.subs.forEach(f=>{try{f()}catch(e){console.error(e)}})})}
function garanteCanal(){if(canal)return;canal=sb.channel("docs-todos").on("postgres_changes",{event:"*",schema:"public",table:"docs"},pl=>{
    if(pl.eventType==="DELETE"){const p=pl.old&&pl.old.path;if(!p)return;const{col,id}=split(p);const st=COL[col];if(st&&st.map.delete(id))emit(st)}
    else{const r=pl.new;const st=COL[r.col];if(st){st.map.set(r.id,r.data);emit(st)}}}).subscribe()}
function colState(col){if(COL[col])return COL[col];const st={map:new Map(),subs:new Set(),pend:false};COL[col]=st;garanteCanal();
  st.ready=(async()=>{const pg=1000;for(let from=0;;from+=pg){const{data,error}=await sb.from("docs").select("id,data").eq("col",col).range(from,from+pg-1);if(error)throw erro(error);data.forEach(r=>st.map.set(r.id,r.data));if(data.length<pg)break}})();
  st.ready.catch(()=>{});return st}
const dsnap=(id,d)=>({id,exists:d!=null,data:()=>d==null?undefined:clone(d),metadata:{}});
const qsnap=list=>({docs:list.map(([id,d])=>({id,exists:true,data:()=>clone(d),ref:doc(null,id)})),size:list.length,empty:!list.length,docChanges:()=>[],metadata:{}});
function filtra(list,fl,ord,lim){let L=list.filter(([id,d])=>fl.every(([f,op,v])=>{const x=d&&d[f];return op==="=="?x===v:op==="!="?x!==v:op===">"?x>v:op===">="?x>=v:op==="<"?x<v:op==="<="?x<=v:op==="in"?(v||[]).includes(x):op==="array-contains"?Array.isArray(x)&&x.includes(v):true}));
  if(ord)L.sort((a,b)=>{const x=a[1][ord.f],y=b[1][ord.f];return(x>y?1:x<y?-1:0)*(ord.d==="desc"?-1:1)});if(lim)L=L.slice(0,lim);return L}
function doc(path,idOnly){if(path==null)return{id:idOnly};const{col,id}=split(path);
  return{id,path,
    async get(){const st=COL[col];if(st){await st.ready;return dsnap(id,st.map.get(id))}const{data,error}=await sb.from("docs").select("data").eq("path",path).maybeSingle();if(error)throw erro(error);return dsnap(id,data?data.data:null)},
    async set(d){const v=limpa(d);const{error}=await sb.from("docs").upsert({path,col,id,data:v,updated_at:new Date().toISOString(),updated_by:sessao&&sessao.user.id});if(error)throw erro(error);const st=COL[col];if(st){st.map.set(id,v);emit(st)}},
    async update(d){const v=limpa(d);const{error}=await sb.rpc("doc_update",{p_path:path,p_patch:v});if(error)throw erro(error);const st=COL[col];if(st){st.map.set(id,Object.assign({},st.map.get(id)||{},v));emit(st)}},
    async delete(){const{error}=await sb.from("docs").delete().eq("path",path);if(error)throw erro(error);const st=COL[col];if(st&&st.map.delete(id))emit(st)},
    onSnapshot(next,err){const st=colState(col);const f=()=>next(dsnap(id,st.map.get(id)));st.ready.then(()=>{st.subs.add(f);f()}).catch(e=>err&&err(erro(e)));return()=>st.subs.delete(f)},
    collection(c){return collection(path+"/"+c)}}}
function collection(path,fl,ord,lim){fl=fl||[];
  const q={path,
    doc(id){return doc(path+"/"+(id||rid()))},
    async add(d){const r=doc(path+"/"+rid());await r.set(d);return r},
    where(f,op,v){return collection(path,fl.concat([[f,op,v]]),ord,lim)},
    orderBy(f,d){return collection(path,fl,{f,d},lim)},
    limit(n){return collection(path,fl,ord,n)},
    async get(){const st=colState(path);await st.ready;return qsnap(filtra([...st.map],fl,ord,lim))},
    onSnapshot(next,err){const st=colState(path);const f=()=>next(qsnap(filtra([...st.map],fl,ord,lim)));st.ready.then(()=>{st.subs.add(f);f()}).catch(e=>err&&err(erro(e)));return()=>st.subs.delete(f)}};
  return q}
const db={doc:p=>doc(p),collection:p=>collection(p)};

/* ---------- usuário ---------- */
const user={
  id:async()=>sessao.user.id,
  me:async()=>({id:sessao.user.id,name:(perfil&&perfil.nome)||sessao.user.email}),
  can:async()=>true,
  canEdit:async()=>!!(perfil&&perfil.admin),
  isOwner:async()=>!!(perfil&&perfil.admin),
  async profiles(ids){const o={};ids=(ids||[]).filter(x=>/^[0-9a-f-]{36}$/i.test(x));if(!ids.length)return o;const{data}=await sb.from("perfis").select("id,nome,email").in("id",ids);(data||[]).forEach(p=>o[p.id]={name:p.nome||p.email||""});return o},
  async search(q){const{data}=await sb.from("perfis").select("id,nome,email");q=String(q||"").toLowerCase();return(data||[]).filter(p=>!q||(p.nome+" "+p.email).toLowerCase().includes(q)).map(p=>({id:p.id,name:p.nome,email:p.email}))}};

/* ---------- arquivos ---------- */
const assets={
  async upload(blob){const tipo=blob.type||"application/octet-stream";const ext=(blob.name&&/\.[a-z0-9]{1,6}$/i.test(blob.name))?blob.name.slice(blob.name.lastIndexOf(".")).toLowerCase():"";const id=rid()+ext;
    const{error}=await sb.storage.from("arquivos").upload(id,blob,{contentType:tipo,upsert:false});if(error)throw erro(error);return{id,url:window.BLOB_BASE+id,sizeBytes:blob.size,contentType:tipo}},
  async list(){const{data}=await sb.storage.from("arquivos").list("",{limit:1000});return{assets:(data||[]).map(f=>({id:f.name,url:window.BLOB_BASE+f.name})),usage:{}}},
  async delete(id){const{error}=await sb.storage.from("arquivos").remove([id]);if(error)throw erro(error)}};

/* ---------- downloads ---------- */
const downloads={async save({filename,data}){const b=data instanceof Blob?data:new Blob([data],{type:/\.html?$/i.test(filename)?"text/html;charset=utf-8":/\.csv$/i.test(filename)?"text/csv;charset=utf-8":"application/octet-stream"});
  const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);return{ok:true}}};

window.claude={use:async n=>{await pronto;return({db,user,assets,downloads})[n]||null}};

/* ---------- leituras do leitor de QR (página pública) ---------- */
const fila=[];let rodando=false;
async function processa(){if(rodando)return;rodando=true;try{while(fila.length){
  const r=fila.shift();for(let k=0;k<60&&!(window.ACL&&window.ACL.dadosProntos&&window.ACL.processarLeitura);k++)await new Promise(z=>setTimeout(z,1000));
  if(!(window.ACL&&window.ACL.processarLeitura))continue;
  const{data}=await sb.rpc("pegar_leitura",{p_id:r.id});if(!data||!data.length)continue;
  let res="";try{res=await window.ACL.processarLeitura(r.num,r.setor)}catch(e){res="erro: "+(e.message||e)}
  await sb.from("leituras").update({resultado:String(res||"ok").slice(0,200)}).eq("id",r.id)}}finally{rodando=false}}
async function iniciaLeituras(){
  sb.channel("leituras").on("postgres_changes",{event:"INSERT",schema:"public",table:"leituras"},pl=>{if(!pl.new.processado){fila.push(pl.new);processa()}}).subscribe();
  const desde=new Date(Date.now()-3*864e5).toISOString();const{data}=await sb.from("leituras").select("*").eq("processado",false).gte("em",desde).order("id");(data||[]).forEach(r=>fila.push(r));processa()}
})();
