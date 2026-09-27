const {createClient}=supabase;
const cfg=window.XIME_CONFIG;
const client=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const TASKS=[];
let participant=JSON.parse(localStorage.getItem("ximeParticipant")||"null");
let adminUser=null,realtime=null;

const $=id=>document.getElementById(id);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function show(id){["home","game","admin"].forEach(x=>$(x).classList.toggle("hidden",x!==id))}
function toast(msg){$("toast").textContent=msg;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),3000)}
function setStatus(ok,text){$("connection").className="status "+(ok?"ok":"bad");$("connection").innerHTML=`<i></i> ${text}`}
function setAuthMode(mode){
  const register=mode==="register";
  $("joinForm").classList.toggle("hidden",!register);
  $("loginFormStudent").classList.toggle("hidden",register);
  $("newTab").classList.toggle("active",register);
  $("returnTab").classList.toggle("active",!register);
  $("authFine").textContent=register?"Use your roll number + PIN next time you open XIME Bingo. Keep your PIN private.":"Enter the roll number and 4-digit PIN you created during registration.";
  document.querySelectorAll("#joinForm input,#joinForm select").forEach(x=>x.required=register);
  document.querySelectorAll("#loginFormStudent input").forEach(x=>x.required=!register);
}
async function loadTasks(){
  const {data,error}=await client.from("bingo_tasks").select("id,task_text,sort_order").order("sort_order");
  if(error){setStatus(false,"Database error");throw error}
  TASKS.splice(0,TASKS.length,...data);
}
$("batch").onchange=()=>{
  const batch=$("batch").value;
  const section=$("section");
  if(batch==="BA05"||batch==="BA06"){
    section.innerHTML='<option value="BA">BA</option>';
    section.value="BA";
    section.disabled=false;
  }else if(batch==="Batch 31"||batch==="Batch 32"){
    section.innerHTML='<option value="">Choose section</option><option>A</option><option>B</option><option>C</option><option>D</option>';
    section.value="";
    section.disabled=false;
  }else{
    section.innerHTML='<option value="">Choose batch first</option>';
    section.value="";
    section.disabled=true;
  }
};

async function registerParticipant(name,roll,batch,section,pin){
  const {data,error}=await client.rpc("register_participant",{p_name:name,p_roll:roll,p_batch:batch,p_section:section,p_pin:pin});
  if(error)return {error:error.message};
  const row=Array.isArray(data)?data[0]:data;
  if(!row?.id)return {error:"Registration failed. Please try again."};
  participant={id:row.id,name:row.name,roll_number:row.roll_number,batch:row.batch,section:row.section};
  localStorage.setItem("ximeParticipant",JSON.stringify(participant));
  show("game");await renderGame();return {};
}
async function loginParticipant(roll,pin){
  const {data,error}=await client.rpc("login_participant",{p_roll:roll,p_pin:pin});
  if(error)return {error:"Unable to sign in. Check your roll number and PIN."};
  const row=Array.isArray(data)?data[0]:data;
  if(!row?.id)return {error:"Incorrect roll number or PIN."};
  participant={id:row.id,name:row.name,roll_number:row.roll_number,batch:row.batch,section:row.section};
  localStorage.setItem("ximeParticipant",JSON.stringify(participant));
  show("game");await renderGame();return {};
}
async function getMyCompletions(){
  if(!participant)return [];
  const {data,error}=await client.rpc("get_my_completions",{p_participant_id:participant.id});
  if(error)throw error;
  return data||[];
}
async function renderGame(){
  $("who").textContent=`${participant.name} · ${participant.roll_number} · ${participant.batch} · Sec ${participant.section}`;
  const done=await getMyCompletions(),map=new Map(done.map(x=>[x.task_id,x.completed_at]));
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
  const {data,error}=await client.rpc("record_completion",{
    p_participant_id:participant.id,
    p_task_id:taskId
  });
  if(error){
    console.error("record_completion:",error);
    toast("Could not record that completion. Please try again.");
    return;
  }
  // The function returns "already_completed" when the square was already recorded.
  await renderGame();
}

$("newTab").onclick=()=>setAuthMode("register");
$("returnTab").onclick=()=>setAuthMode("login");

$("joinForm").onsubmit=async e=>{
  e.preventDefault();
  const b=e.target.querySelector("button");b.disabled=true;b.textContent="Creating account…";
  const pin=$("pin").value.trim();
  if(!/^\d{4}$/.test(pin)){toast("PIN must be exactly 4 digits.");b.disabled=false;b.innerHTML='Create my Bingo account <span>→</span>';return}
  const r=await registerParticipant($("name").value.trim(),$("roll").value.trim(),$("section").value,pin);
  if(r.error)toast(r.error);
  b.disabled=false;b.innerHTML='Create my Bingo account <span>→</span>';
};
$("loginFormStudent").onsubmit=async e=>{
  e.preventDefault();$("studentLoginError").textContent="";
  const b=e.target.querySelector("button");b.disabled=true;b.textContent="Signing in…";
  const r=await loginParticipant($("loginRoll").value.trim(),$("loginPin").value.trim());
  if(r.error)$("studentLoginError").textContent=r.error;
  b.disabled=false;b.innerHTML='Continue to my board <span>→</span>';
};

$("adminOpen").onclick=async()=>{$("login").showModal()};
$("closeLogin").onclick=()=>$("login").close();
$("loginForm").onsubmit=async e=>{
  e.preventDefault();$("loginError").textContent="";
  const {data,error}=await client.auth.signInWithPassword({email:$("email").value,password:$("password").value});
  if(error){$("loginError").textContent=error.message;return}
  adminUser=data.user;await openAdmin();$("login").close();
};
async function openAdmin(){
  show("admin");await renderAdmin();
  if(realtime)await client.removeChannel(realtime);
  realtime=client.channel("xime-completions").on("postgres_changes",{event:"*",schema:"public",table:"completions"},()=>renderAdmin()).subscribe();
}
$("logout").onclick=async()=>{await client.auth.signOut();adminUser=null;if(realtime)await client.removeChannel(realtime);show(participant?"game":"home")};
$("refresh").onclick=renderAdmin;$("search").oninput=renderAdmin;$("batchFilter").onchange=renderAdmin;$("secFilter").onchange=renderAdmin;

let adminRows=[];
async function renderAdmin(){
  const {data,error}=await client.from("participants").select("id,name,roll_number,batch,section,created_at,completions(task_id,completed_at,bingo_tasks(id,task_text,sort_order))").order("created_at",{ascending:false});
  if(error){toast(error.message);return}
  adminRows=data||[];
  const q=$("search").value.toLowerCase(),batch=$("batchFilter").value,sec=$("secFilter").value;
  const rows=adminRows.filter(p=>(!q||`${p.name} ${p.roll_number} ${p.batch||""}`.toLowerCase().includes(q))&&(!batch||p.batch===batch)&&(!sec||p.section===sec));
  const allComps=adminRows.reduce((n,p)=>n+(p.completions?.length||0),0);
  $("people").textContent=adminRows.length;$("tasks").textContent=allComps;$("full").textContent=adminRows.filter(p=>(p.completions?.length||0)>=25).length;
  $("tbody").innerHTML=rows.map(p=>{
    const comps=(p.completions||[]).slice().sort((a,b)=>(a.bingo_tasks?.sort_order||0)-(b.bingo_tasks?.sort_order||0));
    const latest=comps.slice().sort((a,b)=>b.completed_at.localeCompare(a.completed_at))[0];
    return `<tr><td><b>${escapeHtml(p.name)}</b></td><td>${escapeHtml(p.roll_number)}</td><td>${escapeHtml(p.batch||"—")}</td><td><span class="pill">${escapeHtml(p.section)}</span></td><td><b>${comps.length}/25</b></td><td>${latest?new Date(latest.completed_at).toLocaleString():"—"}</td><td><div class="timeline">${comps.map(c=>`<span><b>#${c.bingo_tasks?.sort_order}</b> ${escapeHtml(c.bingo_tasks?.task_text||"Task")} — ${new Date(c.completed_at).toLocaleString()}</span>`).join("")||"No tasks yet"}</div></td></tr>`
  }).join("")||`<tr><td colspan="7">No participants match the current filters.</td></tr>`;
}
$("csv").onclick=()=>{
  const rows=adminRows.flatMap(p=>(p.completions||[]).map(c=>[p.name,p.roll_number,p.section,p.batch,c.bingo_tasks?.sort_order,c.bingo_tasks?.task_text,c.completed_at]));
  const csv=[["Name","Roll Number","Batch","Section","Task Number","Task","Completed At (UTC)"],...rows].map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="xime-bingo-completions.csv";a.click();
};

(async function init(){
  try{await loadTasks();setStatus(true,"Live database");}catch(e){console.error(e);return}
  if(participant){try{show("game");await renderGame()}catch(e){console.error(e);localStorage.removeItem("ximeParticipant");participant=null;show("home")}}
  else show("home");
})();
