const socket = io();
const $ = id => document.getElementById(id);
const lobby=$('lobby'), boardView=$('boardView'), canvas=$('canvas'), ctx=canvas.getContext('2d');
let roomCode=null,currentColor='#202124',brushSize=5,erasing=false,drawing=false,currentStroke=null,strokes=[],toastTimer,gameActive=false,isDrawer=false,gameTickTimer=null;
const root=document.documentElement;
function applyTheme(theme){root.dataset.theme=theme;const dark=theme==='dark';$('themeIcon').textContent=dark?'☀':'☾';$('themeLabel').textContent=dark?'Light mode':'Dark mode';$('themeToggle').setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');document.querySelector('meta[name="theme-color"]').content=dark?'#13131b':'#f7f6fc';}
let savedTheme='light';try{savedTheme=localStorage.getItem('scramble-guys-theme')||'light';}catch{} applyTheme(savedTheme);
$('themeToggle').addEventListener('click',()=>{const next=root.dataset.theme==='dark'?'light':'dark';applyTheme(next);try{localStorage.setItem('scramble-guys-theme',next);}catch{};});
socket.on('connect',()=>{$('connection').classList.add('online');$('connection').innerHTML='<span></span> Connected';});
socket.on('disconnect',()=>{$('connection').classList.remove('online');$('connection').innerHTML='<span></span> Reconnecting';});
socket.on('draw',stroke=>{strokes.push(stroke);renderStroke(stroke);$('canvasHint').style.display='none';});
socket.on('clear-board',()=>{strokes=[];clearCanvas();$('canvasHint').style.display='flex';});
socket.on('players',players=>{$('players').innerHTML='';players.forEach(p=>{const el=document.createElement('span');el.className='player-pill';el.textContent=p.name;$('players').appendChild(el);});});
socket.on('notice',showToast);
socket.on('word-game-started',data=>{gameActive=true;isDrawer=data.drawerId===socket.id;$('wordPrompt').textContent=isDrawer?'Your word is coming…':`${data.drawerName} is drawing. Guess the word!`;$('gameMessage').textContent='You have 60 seconds. Correct guess: +10 points; drawer: +5.';$('guessArea').classList.toggle('hidden',isDrawer);$('startGameBtn').classList.add('hidden');$('nextRoundBtn').classList.add('hidden');$('gameTimer').classList.remove('hidden');$('gameTimer').textContent=Math.max(0,Math.ceil((data.endsAt-Date.now())/1000))+'s';$('guessInput').value='';canvas.style.cursor=isDrawer?'crosshair':'not-allowed';$('statusText').innerHTML=isDrawer?'<i class="footer-dot"></i> You are drawing. Only you can draw this round.':'<i class="footer-dot"></i> Guess the word to score points.';});
socket.on('your-word',data=>{$('wordPrompt').textContent='Draw this: '+data.word.toUpperCase();$('gameMessage').textContent='Keep the word secret. Let your friends guess it!';});
socket.on('word-game-state',data=>{renderScores(data.scores||[]);if(!data.active&&data.round>0){$('startGameBtn').classList.add('hidden');$('nextRoundBtn').classList.remove('hidden');}});
socket.on('word-game-tick',data=>{$('gameTimer').textContent=data.seconds+'s';$('gameTimer').classList.toggle('urgent',data.seconds<=10);});
socket.on('word-correct',data=>{showToast(`${data.playerName} guessed it! +10 points`);$('gameMessage').textContent=`${data.playerName} guessed correctly! ${data.drawerName} earns 5 drawing points.`;});
socket.on('word-game-ended',data=>{gameActive=false;isDrawer=false;$('gameTimer').classList.add('hidden');$('guessArea').classList.add('hidden');$('wordPrompt').textContent='The word was: '+data.word.toUpperCase();$('gameMessage').textContent=data.reason==='guessed'?'Round complete! Points have been added.':'Time is up! Try another round.';$('nextRoundBtn').classList.remove('hidden');canvas.style.cursor='crosshair';$('statusText').innerHTML='<i class="footer-dot"></i> Round ended. Start the next round when ready.';renderScores(data.scores||[]);});
socket.on('guess-result',data=>{if(!data.correct){$('gameMessage').textContent=data.message;}});
function renderScores(scores){$('scoreList').innerHTML='';scores.sort((a,b)=>b.score-a.score).forEach((p,i)=>{const el=document.createElement('span');el.className='score-pill';el.innerHTML=`<b>${i+1}</b> <span></span> <strong>${p.score||0} pts</strong>`;el.children[1].textContent=p.name; $('scoreList').appendChild(el);});if(!scores.length)$('scoreList').innerHTML='<span class="score-empty">Scores appear when you start playing.</span>';}
function submitGuess(){const guess=$('guessInput').value.trim();if(!guess||!gameActive||isDrawer)return;socket.emit('guess-word',guess);$('guessInput').value='';} 
$('startGameBtn').addEventListener('click',()=>socket.emit('start-word-game'));
$('nextRoundBtn').addEventListener('click',()=>socket.emit('next-word-round'));
$('guessBtn').addEventListener('click',submitGuess);
$('guessInput').addEventListener('keydown',e=>{if(e.key==='Enter')submitGuess();});
function name(){return $('playerName').value.trim()||'Friend';}
function enterRoom(result){if(!result||!result.ok){$('lobbyError').textContent=result?.error||'Could not join this room.';return;}roomCode=result.code;strokes=result.strokes||[];$('lobbyError').textContent='';$('roomCodeDisplay').textContent=roomCode;lobby.classList.add('hidden');boardView.classList.remove('hidden');resizeCanvas();renderAll();$('statusText').innerHTML='<i class="footer-dot"></i> You are in. Share the code with your friends.';}
$('createBtn').addEventListener('click',()=>socket.emit('create-room',{name:name()},enterRoom));
$('joinBtn').addEventListener('click',()=>{const code=$('roomCodeInput').value.trim().toUpperCase();if(code.length!==6){$('lobbyError').textContent='Enter the 6-character room code.';return;}socket.emit('join-room',{code,name:name()},enterRoom);});
$('roomCodeInput').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
$('copyCodeBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(roomCode);showToast('Room code copied. Send it to your friends!');}catch{showToast('Your room code is '+roomCode);}});
$('leaveBtn').addEventListener('click',()=>{roomCode=null;boardView.classList.add('hidden');lobby.classList.remove('hidden');$('roomCodeInput').value='';strokes=[];socket.disconnect();socket.connect();});
$('clearBtn').addEventListener('click',()=>{if(confirm('Clear the drawing for everyone in this room?'))socket.emit('clear-board');});
$('penBtn').addEventListener('click',()=>setTool(false));$('eraserBtn').addEventListener('click',()=>setTool(true));
function setTool(value){erasing=value;currentColor=value?(root.dataset.theme==='dark'?'#1b1b27':'#ffffff'):(document.querySelector('.swatch.selected')?.dataset.color||'#202124');$('penBtn').classList.toggle('active',!value);$('eraserBtn').classList.toggle('active',value);canvas.style.cursor=value?'cell':'crosshair';}
document.querySelectorAll('.swatch').forEach(el=>el.addEventListener('click',()=>{document.querySelectorAll('.swatch').forEach(s=>s.classList.remove('selected'));el.classList.add('selected');erasing=false;currentColor=el.dataset.color;$('penBtn').classList.add('active');$('eraserBtn').classList.remove('active');canvas.style.cursor='crosshair';}));
$('brushSize').addEventListener('input',e=>{brushSize=Number(e.target.value);$('sizeValue').textContent=brushSize;});
function resizeCanvas(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const dpr=window.devicePixelRatio||1;canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);renderAll();}
window.addEventListener('resize',()=>{if(!boardView.classList.contains('hidden'))resizeCanvas();});
function pointFromEvent(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
canvas.addEventListener('pointerdown',e=>{if(!roomCode||(gameActive&&!isDrawer))return;drawing=true;canvas.setPointerCapture(e.pointerId);currentStroke={color:currentColor,width:brushSize,points:[pointFromEvent(e)]};$('canvasHint').style.display='none';drawSegment(currentStroke,0,0);});
canvas.addEventListener('pointermove',e=>{if(!drawing||!currentStroke)return;currentStroke.points.push(pointFromEvent(e));drawSegment(currentStroke,currentStroke.points.length-2,currentStroke.points.length-1);});
function finishStroke(){if(!drawing||!currentStroke)return;drawing=false;strokes.push(currentStroke);socket.emit('draw',currentStroke);currentStroke=null;}
canvas.addEventListener('pointerup',finishStroke);canvas.addEventListener('pointercancel',finishStroke);
function drawSegment(stroke,from,to){const r=canvas.getBoundingClientRect(),p=stroke.points;if(!p.length)return;ctx.save();ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.width;ctx.lineCap='round';ctx.lineJoin='round';if(p.length===1){ctx.beginPath();ctx.arc(p[0].x*r.width,p[0].y*r.height,stroke.width/2,0,Math.PI*2);ctx.fill();}else{ctx.beginPath();ctx.moveTo(p[from].x*r.width,p[from].y*r.height);ctx.lineTo(p[to].x*r.width,p[to].y*r.height);ctx.stroke();}ctx.restore();}
function renderStroke(stroke){if(!stroke.points.length)return;ctx.save();ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.width;ctx.lineCap='round';ctx.lineJoin='round';const r=canvas.getBoundingClientRect(),p=stroke.points;ctx.beginPath();ctx.moveTo(p[0].x*r.width,p[0].y*r.height);if(p.length===1){ctx.arc(p[0].x*r.width,p[0].y*r.height,stroke.width/2,0,Math.PI*2);ctx.fill();}else{for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x*r.width,p[i].y*r.height);ctx.stroke();}ctx.restore();}
function renderAll(){clearCanvas();strokes.forEach(renderStroke);if(strokes.length)$('canvasHint').style.display='none';else $('canvasHint').style.display='flex';}
function clearCanvas(){const dpr=window.devicePixelRatio||1;ctx.clearRect(0,0,canvas.width/dpr,canvas.height/dpr);}
function showToast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}
