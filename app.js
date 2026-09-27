const {createClient}=supabase;
const cfg=window.XIME_CONFIG;
const client=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const TASKS=[];
const LINE_DEFS=[
  {key:"r1",label:"Row 1",short:"R1",pos:[1,2,3,4,5]},
  {key:"r2",label:"Row 2",short:"R2",pos:[6,7,8,9,10]},
  {key:"r3",label:"Row 3",short:"R3",pos:[11,12,13,14,15]},
  {key:"r4",label:"Row 4",short:"R4",pos:[16,17,18,19,20]},
  {key:"r5",label:"Row 5",short:"R5",pos:[21,22,23,24,25]},
  {key:"c1",label:"Column 1",short:"C1",pos:[1,6,11,16,21]},
  {key:"c2",label:"Column 2",short:"C2",pos:[2,7,12,17,22]},
  {key:"c3",label:"Column 3",short:"C3",pos:[3,8,13,18,23]},
  {key:"c4",label:"Column 4",short:"C4",pos:[4,9,14,19,24]},
  {key:"c5",label:"Column 5",short:"C5",pos:[5,10,15,20,25]},
  {key:"d1",label:"Diagonal ↘",short:"↘",pos:[1,7,13,19,25]},
  {key:"d2",label:"Diagonal ↙",short:"↙",pos:[5,9,13,17,21]}
];
let participant=JSON.parse(localStorage.getItem("ximeParticipant")||"null");
let adminUser=null,realtime=null,pendingTaskId=null,leaderTimer=null;
const $=id=>document.getElementById(id);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const pointsFor=d=>d==="easy"?1:d==="crazy"?3:2;
const difficultyLabel=d=>d==="easy"?"Easy":d==="crazy"?"Crazy":"Challenge";
function show(id){["home","instructions","game","admin"].forEach(x=>$(x).classList.toggle("hidden",x!==id));window.scrollTo({top:0,behavior:"smooth"})}
function toast(msg){$("toast").textContent=msg;$("toast").classList.remove("hidden");clearTimeout(window.__toast);window.__toast=setTimeout(()=>$("toast").classList.add("hidden"),3200)}
function setStatus(ok,text){$("connection").className="status "+(ok?"ok":"bad");$("connection").innerHTML=`<i></i> ${text}`}
function applyTheme(){const dark=localStorage.getItem("ximeTheme")==="dark";document.body.classList.toggle("dark",dark);$("themeToggle").textContent=dark?"☀":"☾"}
function setAuthMode(mode){
  const register=mode==="register";
  $("joinForm").classList.toggle("hidden",!register);$("loginFormStudent").classList.toggle("hidden",register);
  $("newTab").classList.toggle("active",register);$("returnTab").classList.toggle("active",!register);
  $("authFine").textContent=register?"Use your roll number + PIN next time you open XIME Bingo. Keep your PIN private.":"Enter the roll number and 4-digit PIN you created during registration.";
  document.querySelectorAll("#joinForm input,#joinForm select").forEach(x=>x.required=register);
  document.querySelectorAll("#loginFormStudent input").forEach(x=>x.required=!register);
}
async function loadTasks(){
  const {data,error}=await client.from("bingo_tasks").select("id,task_text,sort_order,difficulty").order("sort_order");
  if(error){setStatus(false,"Database error");throw error}
  TASKS.splice(0,TASKS.length,...data);
}
$("batch").onchange=()=>{
  const batch=$("batch").value,section=$("section");
  if(batch==="BA05"||batch==="BA06"){section.innerHTML='<option value="BA">BA</option>';section.value="BA";section.disabled=false}
  else if(batch==="Batch 31"||batch==="Batch 32"){section.innerHTML='<option value="">Choose section</option><option>A</option><option>B</option><option>C</option><option>D</option>';section.value="";section.disabled=false}
  else{section.innerHTML='<option value="">Choose batch first</option>';section.value="";section.disabled=true}
};
async function registerParticipant(name,roll,batch,section,pin){
  const {data,error}=await client.rpc("register_participant",{p_name:name,p_roll:roll,p_batch:batch,p_section:section,p_pin:pin});
  if(error)return {error:error.message};const row=Array.isArray(data)?data[0]:data;
  if(!row?.id)return {error:"Registration failed. Please try again."};
  participant={id:row.id,name:row.name,roll_number:row.roll_number,batch:row.batch,section:row.section};
  localStorage.setItem("ximeParticipant",JSON.stringify(participant));show("instructions");return {};
}
async function loginParticipant(roll,pin){
  const {data,error}=await client.rpc("login_participant",{p_roll:roll,p_pin:pin});
  if(error)return {error:"Unable to sign in. Check your roll number and PIN."};const row=Array.isArray(data)?data[0]:data;
  if(!row?.id)return {error:"Incorrect roll number or PIN."};participant={id:row.id,name:row.name,roll_number:row.roll_number,batch:row.batch,section:row.section};localStorage.setItem("ximeParticipant",JSON.stringify(participant));show("instructions");return {};
}
async function validateStoredParticipant(){
  if(!participant)return false;
  const {data,error}=await client.rpc("participant_exists",{p_participant_id:participant.id});
  if(error||!data){localStorage.removeItem("ximeParticipant");participant=null;return false}
  return true;
}
async function getMyCompletions(){
  if(!participant)return [];
  const {data,error}=await client.rpc("get_my_completions",{p_participant_id:participant.id});if(error)throw error;return data||[];
}
async function getMyScore(){
  if(!participant)return {completed_count:0,task_points:0,bingo_lines:0,bingo_bonus:0,total_score:0};
  const {data,error}=await client.rpc("get_my_score",{p_participant_id:participant.id});if(error)throw error;return (Array.isArray(data)?data[0]:data)||{completed_count:0,task_points:0,bingo_lines:0,bingo_bonus:0,total_score:0};
}
function getCompletedLines(donePositions){
  const set=new Set(donePositions);
  return LINE_DEFS.filter(line=>line.pos.every(p=>set.has(p)));
}
function renderLineStatus(donePositions){
  const completed=getCompletedLines(donePositions);const keys=new Set(completed.map(x=>x.key));
  $("lineStatus").innerHTML=LINE_DEFS.map(line=>`<span class="line-chip ${keys.has(line.key)?"complete":""}"><b>${line.short}</b>${keys.has(line.key)?"✓":""}</span>`).join("");
  $("lineBonus").textContent=`+${Math.min(completed.length,2)*5} bonus`;
  return keys;
}
async function renderGame(){
  $("who").textContent=`${participant.name} · ${participant.roll_number} · ${participant.batch} · Sec ${participant.section}`;
  const done=await getMyCompletions(),map=new Map(done.map(x=>[x.task_id,x.completed_at]));
  const donePositions=TASKS.filter(t=>map.has(t.id)).map(t=>t.sort_order);
  const lineKeys=renderLineStatus(donePositions);
  const score=await getMyScore();
  $("score").textContent=score.total_score;
  $("scoreMeta").textContent=`${score.task_points} task pts · ${score.bingo_lines} lines · +${score.bingo_bonus} bonus`;
  $("grid").innerHTML=TASKS.map((t,i)=>{
    const ts=map.get(t.id),lineHit=lineKeys.size&&LINE_DEFS.some(line=>lineKeys.has(line.key)&&line.pos.includes(t.sort_order));
    return `<button class="cell ${ts?"done":""} ${lineHit?"line-hit":""}" data-task="${t.id}" ${ts?"aria-pressed=\"true\"":""}>
      <span class="cell-top"><span class="num">${String(i+1).padStart(2,"0")}</span><span class="difficulty ${t.difficulty}">${pointsFor(t.difficulty)} · ${difficultyLabel(t.difficulty)}</span></span>
      <span class="task">${escapeHtml(t.task_text)}</span>
      <span class="done-text">${ts?"✓ LOCKED · "+new Date(ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"Post proof → get 👍 → tap"}</span>
      ${lineHit?'<span class="line-mark">BINGO LINE</span>':""}
    </button>`;
  }).join("");
  document.querySelectorAll(".cell:not(.done)").forEach(b=>b.onclick=()=>openConfirm(+b.dataset.task));
  const completedLines=getCompletedLines(donePositions);
  if(completedLines.length){$("bingo").classList.remove("hidden");$("bingo").innerHTML=`<b>🎯 ${completedLines.length} Bingo line${completedLines.length>1?"s":""} completed.</b> You have earned +${Math.min(completedLines.length,2)*5} line bonus points.`}
  else $("bingo").classList.add("hidden");
}
function openConfirm(taskId){
  const task=TASKS.find(t=>t.id===taskId);if(!task)return;
  pendingTaskId=taskId;$("verifiedCheck").checked=false;$("confirmSubmit").disabled=true;
  $("confirmTaskText").innerHTML=`<b>${escapeHtml(task.task_text)}</b><br><span class="muted">${pointsFor(task.difficulty)} points · ${difficultyLabel(task.difficulty)}</span>`;
  $("confirmTask").showModal();
}
$("verifiedCheck").onchange=e=>$("confirmSubmit").disabled=!e.target.checked;
$("closeConfirm").onclick=()=>$("confirmTask").close();
$("confirmTaskForm").onsubmit=async e=>{
  e.preventDefault();if(!pendingTaskId||!$("verifiedCheck").checked)return;
  const b=$("confirmSubmit");b.disabled=true;b.textContent="Locking square…";
  const {error}=await client.rpc("record_completion",{p_participant_id:participant.id,p_task_id:pendingTaskId});
  if(error){console.error(error);toast("Could not record that completion. Please try again.");b.disabled=false;b.innerHTML='Mark complete — lock it <span>✓</span>';return}
  $("confirmTask").close();pendingTaskId=null;b.innerHTML='Mark complete — lock it <span>✓</span>';await renderGame();
};
$("openBoard").onclick=async()=>{show("game");await renderGame()};
$("showInstructions").onclick=()=>show("instructions");
$("newTab").onclick=()=>setAuthMode("register");$("returnTab").onclick=()=>setAuthMode("login");
$("joinForm").onsubmit=async e=>{
  e.preventDefault();const b=e.target.querySelector("button");b.disabled=true;b.textContent="Creating account…";const pin=$("pin").value.trim();
  if(!/^\d{4}$/.test(pin)){toast("PIN must be exactly 4 digits.");b.disabled=false;b.innerHTML='Create my Bingo account <span>→</span>';return}
  const r=await registerParticipant($("name").value.trim(),$("roll").value.trim(),$("batch").value,$("section").value,pin);if(r.error)toast(r.error);b.disabled=false;b.innerHTML='Create my Bingo account <span>→</span>';
};
$("loginFormStudent").onsubmit=async e=>{
  e.preventDefault();$("studentLoginError").textContent="";const b=e.target.querySelector("button");b.disabled=true;b.textContent="Signing in…";
  const r=await loginParticipant($("loginRoll").value.trim(),$("loginPin").value.trim());if(r.error)$("studentLoginError").textContent=r.error;b.disabled=false;b.innerHTML='Continue to my board <span>→</span>';
};
async function loadLeaderboard(){
  const {data,error}=await client.rpc("get_leaderboard",{p_limit:10});
  if(error){$("leaderRows").innerHTML='<div class="loading">Leaderboard is temporarily unavailable.</div>';return}
  const rows=data||[];
  $("leaderRows").innerHTML=rows.length?rows.map((r,i)=>`<div class="leader-row ${participant&&r.participant_id===participant.id?"me":""}"><div class="rank rank-${i+1}">${i<3?["🥇","🥈","🥉"][i]:r.rank}</div><div class="leader-person"><b>${escapeHtml(r.name)}</b><span>${escapeHtml(r.batch||"")} · Sec ${escapeHtml(r.section||"")}</span></div><div class="leader-progress"><b>${r.total_score}</b><span>${r.completed_count}/25 · ${r.bingo_lines} lines</span></div></div>`).join(""):'<div class="loading">No scores yet. Be the first on the board.</div>';
}
function openLeaderboard(){$("leaderboard").showModal();loadLeaderboard();clearInterval(leaderTimer);leaderTimer=setInterval(loadLeaderboard,5000)}
function closeLeaderboard(){clearInterval(leaderTimer);$("leaderboard").close()}
$("leaderboardOpen").onclick=openLeaderboard;$("instructionsLeaderboard").onclick=openLeaderboard;$("boardLeaderboard").onclick=openLeaderboard;$("closeLeaderboard").onclick=closeLeaderboard;
$("themeToggle").onclick=()=>{const dark=document.body.classList.toggle("dark");localStorage.setItem("ximeTheme",dark?"dark":"light");$("themeToggle").textContent=dark?"☀":"☾"};
$("adminOpen").onclick=()=>$("login").showModal();$("closeLogin").onclick=()=>$("login").close();
$("loginForm").onsubmit=async e=>{e.preventDefault();$("loginError").textContent="";const {data,error}=await client.auth.signInWithPassword({email:$("email").value,password:$("password").value});if(error){$("loginError").textContent=error.message;return}adminUser=data.user;await openAdmin();$("login").close()};
async function openAdmin(){show("admin");await renderAdmin();if(realtime)await client.removeChannel(realtime);realtime=client.channel("xime-completions").on("postgres_changes",{event:"*",schema:"public",table:"completions"},()=>renderAdmin()).subscribe()}
$("logout").onclick=async()=>{await client.auth.signOut();adminUser=null;if(realtime)await client.removeChannel(realtime);show(participant?"game":"home")};
$("refresh").onclick=renderAdmin;$("search").oninput=renderAdmin;$("batchFilter").onchange=renderAdmin;$("secFilter").onchange=renderAdmin;
let adminRows=[];
function calcClientScore(p){const comps=p.completions||[],points=comps.reduce((s,c)=>s+pointsFor(c.bingo_tasks?.difficulty),0),positions=new Set(comps.map(c=>c.bingo_tasks?.sort_order));const lines=LINE_DEFS.filter(l=>l.pos.every(x=>positions.has(x))).length;return {points,lines,bonus:Math.min(lines,2)*5,total:points+Math.min(lines,2)*5}}
async function renderAdmin(){
  const {data,error}=await client.from("participants").select("id,name,roll_number,batch,section,created_at,completions(task_id,completed_at,bingo_tasks(id,task_text,sort_order,difficulty))").order("created_at",{ascending:false});
  if(error){toast(error.message);return}adminRows=data||[];const q=$("search").value.toLowerCase(),batch=$("batchFilter").value,sec=$("secFilter").value;
  const rows=adminRows.filter(p=>(!q||`${p.name} ${p.roll_number} ${p.batch||""}`.toLowerCase().includes(q))&&(!batch||p.batch===batch)&&(!sec||p.section===sec));
  const allComps=adminRows.reduce((n,p)=>n+(p.completions?.length||0),0);const scored=adminRows.map(calcClientScore).sort((a,b)=>b.total-a.total);$("people").textContent=adminRows.length;$("tasks").textContent=allComps;$("full").textContent=adminRows.filter(p=>(p.completions?.length||0)>=25).length;$("highScore").textContent=scored[0]?.total??0;
  $("tbody").innerHTML=rows.map(p=>{const comps=(p.completions||[]).slice().sort((a,b)=>(a.bingo_tasks?.sort_order||0)-(b.bingo_tasks?.sort_order||0)),s=calcClientScore(p),latest=comps.slice().sort((a,b)=>b.completed_at.localeCompare(a.completed_at))[0];return `<tr><td><b>${escapeHtml(p.name)}</b></td><td>${escapeHtml(p.roll_number)}</td><td>${escapeHtml(p.batch||"—")}</td><td><span class="pill">${escapeHtml(p.section)}</span></td><td><b>${s.total}</b><small>${s.points} task + ${s.bonus} bonus</small></td><td><b>${comps.length}/25</b></td><td>${latest?new Date(latest.completed_at).toLocaleString():"—"}</td><td><div class="timeline">${comps.map(c=>`<span><b>#${c.bingo_tasks?.sort_order}</b> ${escapeHtml(c.bingo_tasks?.task_text||"Task")} · ${pointsFor(c.bingo_tasks?.difficulty)} pts · ${new Date(c.completed_at).toLocaleString()}</span>`).join("")||"No tasks yet"}</div></td></tr>`}).join("")||'<tr><td colspan="8">No participants match the current filters.</td></tr>';
}
$("csv").onclick=()=>{const rows=adminRows.flatMap(p=>{const s=calcClientScore(p);return (p.completions||[]).map(c=>[p.name,p.roll_number,p.batch,p.section,s.total,c.bingo_tasks?.sort_order,c.bingo_tasks?.task_text,difficultyLabel(c.bingo_tasks?.difficulty),pointsFor(c.bingo_tasks?.difficulty),c.completed_at])});const csv=[["Name","Roll Number","Batch","Section","Total Score","Task Number","Task","Difficulty","Task Points","Completed At (UTC)"],...rows].map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="xime-bingo-completions.csv";a.click()};
(async function init(){
  applyTheme();
  try{await loadTasks();setStatus(true,"Live database")}catch(e){console.error(e);return}
  if(participant){const valid=await validateStoredParticipant();if(valid){show("instructions")}else show("home")}else show("home");
})();
