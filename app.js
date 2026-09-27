const {createClient}=supabase;
const cfg=window.XIME_CONFIG;
const client=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const TASKS=[];
let participant=JSON.parse(localStorage.getItem("ximeParticipant")||"null");
let adminUser=null, realtime=null;

const $=id=>document.getElementById(id);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function show(id){["home","game","admin"].forEach(x=>$(x).classList.toggle("hidden",x!==id))}
function toast(msg){$("toast").textContent=msg;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),2600)}
function setStatus(ok,text){$("connection").className="status "+(ok?"ok":"bad");$("connection").innerHTML=`<i></i> ${text}`}

async function loadTasks(){
  const {data,error}=await client.from("bingo_tasks").select("id,task_text,sort_order").order("sort_order");
  if(error){setStatus(false,"Database error");throw error}
  TASKS.splice(0,TASKS.length,...data);
}
async function join(name,roll,section){
  // Generate the participant UUID in the browser. This lets us save the ID
  // without requiring an anonymous SELECT policy on the participants table.
  const id=crypto.randomUUID();
  const row={id,name,roll_number:roll,section};
  const {error}=await client.from("participants").insert(row);
  if(error){
    if(error.code==="23505") return {error:"That roll number is already registered. Use the existing session on this device, or ask the event team."};
    return {error:error.message};
  }
  participant=row;localStorage.setItem("ximeParticipant",JSON.stringify(participant));
  show("game");await renderGame();return {};
}
async function getMyCompletions(){
  if(!participant)return [];
  // Participant IDs are random UUIDs; this query is intentionally scoped to the current participant.
  const {data,error}=await client.from("completions").select("task_id,completed_at").eq("participant_id",participant.id);
  if(error) throw error;return data||[];
}
async function renderGame(){
  $("who").textContent=`${participant.name} · ${participant.roll_number} · Sec ${participant.section}`;
  const done=await getMyCompletions(), map=new Map(done.map(x=>[x.task_id,x.completed_at]));
  $("count").textContent=done.length;
  $("grid").innerHTML=TASKS.map((t,i)=>{
    const ts=map.get(t.id);
    return `<button class="cell ${ts?"done":""}" data-task="${t.id}">
      <span class="num">SQUARE ${String(i+1).padStart(2,"0")}</span>
      <span class="task">${escapeHtml(t.task_text)}</span>
      <span class="done-text">${ts?"✓ "+new Date(ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"Tap when complete"}</span>
    </button>`;
  }).join("");
  document.querySelectorAll(".cell").forEach(b=>b.onclick=()=>complete(+b.dataset.task));
  if(done.length>=5){$("bingo").classList.remove("hidden");$("bingo").textContent=done.length===25?"🎉 FULL BINGO — board complete!":"BINGO milestone reached. Keep going!"}
  else $("bingo").classList.add("hidden");
}
async function complete(taskId){
  const {error}=await client.from("completions").insert({participant_id:participant.id,task_id:taskId});
  if(error?.code==="23505"){await renderGame();return}
  if(error){toast("Could not record that completion. Try again.");return}
  await renderGame();
}
$("joinForm").onsubmit=async e=>{
  e.preventDefault();
  const b=e.target.querySelector("button");b.disabled=true;b.textContent="Joining…";
  const r=await join($("name").value.trim(),$("roll").value.trim(),$("section").value);
  if(r.error)toast(r.error);
  b.disabled=false;b.innerHTML='Enter XIME Bingo <span>→</span>';
};
$("switch").onclick=()=>{localStorage.removeItem("ximeParticipant");participant=null;show("home")};

$("adminOpen").onclick=async()=>{$("login").showModal();};
$("closeLogin").onclick=()=>$("login").close();
$("loginForm").onsubmit=async e=>{
  e.preventDefault();$("loginError").textContent="";
  const {data,error}=await client.auth.signInWithPassword({email:$("email").value,password:$("password").value});
  if(error){$("loginError").textContent=error.message;return}
  adminUser=data.user;await openAdmin();$("login").close();
};
async function checkAdmin(){
  const {data}=await client.auth.getUser();
  if(data.user){adminUser=data.user;await openAdmin();return true}return false;
}
async function openAdmin(){
  show("admin");await renderAdmin();
  if(realtime)await client.removeChannel(realtime);
  realtime=client.channel("xime-completions").on("postgres_changes",{event:"*",schema:"public",table:"completions"},()=>renderAdmin()).subscribe();
}
$("logout").onclick=async()=>{await client.auth.signOut();adminUser=null;if(realtime)await client.removeChannel(realtime);show(participant?"game":"home")};
$("refresh").onclick=renderAdmin;$("search").oninput=renderAdmin;$("secFilter").onchange=renderAdmin;

let adminRows=[];
async function renderAdmin(){
  const {data,error}=await client.from("participants").select("id,name,roll_number,section,created_at,completions(task_id,completed_at,bingo_tasks(id,task_text,sort_order))").order("created_at",{ascending:false});
  if(error){toast(error.message);return}
  adminRows=data||[];
  const q=$("search").value.toLowerCase(), sec=$("secFilter").value;
  const rows=adminRows.filter(p=>(!q||`${p.name} ${p.roll_number}`.toLowerCase().includes(q))&&(!sec||p.section===sec));
  const allComps=adminRows.reduce((n,p)=>n+(p.completions?.length||0),0);
  $("people").textContent=adminRows.length;$("tasks").textContent=allComps;$("full").textContent=adminRows.filter(p=>(p.completions?.length||0)>=25).length;
  $("tbody").innerHTML=rows.map(p=>{
    const comps=(p.completions||[]).slice().sort((a,b)=>(a.bingo_tasks?.sort_order||0)-(b.bingo_tasks?.sort_order||0));
    const latest=comps.slice().sort((a,b)=>b.completed_at.localeCompare(a.completed_at))[0];
    return `<tr><td><b>${escapeHtml(p.name)}</b></td><td>${escapeHtml(p.roll_number)}</td><td><span class="pill">${escapeHtml(p.section)}</span></td><td><b>${comps.length}/25</b></td><td>${latest?new Date(latest.completed_at).toLocaleString():"—"}</td><td><div class="timeline">${comps.map(c=>`<span><b>#${c.bingo_tasks?.sort_order}</b> ${escapeHtml(c.bingo_tasks?.task_text||"Task")} — ${new Date(c.completed_at).toLocaleString()}</span>`).join("")||"No tasks yet"}</div></td></tr>`
  }).join("")||`<tr><td colspan="6">No participants match the current filters.</td></tr>`;
}
$("csv").onclick=()=>{
  const rows=adminRows.flatMap(p=>(p.completions||[]).map(c=>[p.name,p.roll_number,p.section,c.bingo_tasks?.sort_order,c.bingo_tasks?.task_text,c.completed_at]));
  const csv=[["Name","Roll Number","Section","Task Number","Task","Completed At (UTC)"],...rows].map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="xime-bingo-completions.csv";a.click();
};

(async function init(){
  try{await loadTasks();setStatus(true,"Live database");}catch(e){console.error(e);return}
  if(participant){try{show("game");await renderGame()}catch(e){console.error(e);show("home")}}
  else show("home");
})();