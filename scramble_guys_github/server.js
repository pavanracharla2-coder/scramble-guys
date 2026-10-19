const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const WORDS = ['rainbow','pizza','dragon','guitar','rocket','turtle','sunflower','volcano','ice cream','airplane','cactus','basketball','butterfly','lighthouse','popcorn','spaceship','watermelon','snowman','dinosaur','toothbrush','treasure chest','hot dog','sleeping cat','roller coaster','birthday cake','washing machine','traffic light','superhero','octopus','campfire'];
app.use(express.static(path.join(__dirname, 'public')));
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code;
  do { code = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join(''); } while (rooms.has(code));
  return code;
}
function gameState(room) {
  const g = room.game;
  return {active:g.active, round:g.round, drawerId:g.drawerId, drawerName:room.players.get(g.drawerId)?.name || '', endsAt:g.endsAt, scores:[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score||0})), guessed:[...g.guessed]};
}
function broadcastGame(code) { const room=rooms.get(code); if(room) io.to(code).emit('word-game-state', gameState(room)); }
function endRound(code, reason) {
  const room=rooms.get(code); if(!room || !room.game.active) return;
  const g=room.game; g.active=false; if(g.timer) clearInterval(g.timer); g.timer=null;
  io.to(code).emit('word-game-ended',{word:g.word,reason,scores:gameState(room).scores});
  broadcastGame(code);
}
function startRound(code) {
  const room=rooms.get(code); if(!room || room.players.size<2) return;
  const players=[...room.players.values()]; const oldIndex=players.findIndex(p=>p.id===room.game.drawerId);
  const drawer=players[(oldIndex+1+players.length)%players.length];
  const word=WORDS[Math.floor(Math.random()*WORDS.length)]; const g=room.game;
  if(g.timer) clearInterval(g.timer);
  g.active=true; g.round+=1; g.drawerId=drawer.id; g.word=word; g.guessed=new Set(); g.endsAt=Date.now()+60000;
  room.strokes=[]; io.to(code).emit('clear-board');
  io.to(code).emit('word-game-started',{round:g.round,drawerId:drawer.id,drawerName:drawer.name,endsAt:g.endsAt});
  io.to(code).emit('word-game-state',gameState(room));
  io.to(drawer.id).emit('your-word',{word});
  g.timer=setInterval(()=>{
    const current=rooms.get(code); if(!current || !current.game.active) return;
    const seconds=Math.max(0,Math.ceil((current.game.endsAt-Date.now())/1000));
    io.to(code).emit('word-game-tick',{seconds});
    if(seconds<=0) endRound(code,'time');
  },1000);
}
io.on('connection', socket => {
  socket.on('create-room', ({name} = {}, reply) => joinRoom(socket, makeCode(), name, reply, true));
  socket.on('join-room', ({code, name} = {}, reply) => {
    code = String(code || '').trim().toUpperCase();
    if (!rooms.has(code)) return typeof reply === 'function' && reply({ok:false, error:'Room not found. Check the code and try again.'});
    joinRoom(socket, code, name, reply, false);
  });
  function joinRoom(sock, code, name, reply, create) {
    if (create) rooms.set(code, {strokes:[], players:new Map(), game:{active:false,round:0,drawerId:null,word:'',endsAt:0,timer:null,guessed:new Set()}});
    const room = rooms.get(code);
    if (sock.data.roomCode && rooms.has(sock.data.roomCode)) {
      const oldCode=sock.data.roomCode, old=rooms.get(oldCode); old.players.delete(sock.id); sock.leave(oldCode);
      io.to(oldCode).emit('players',[...old.players.values()]); broadcastGame(oldCode);
      if (!old.players.size) { if(old.game.timer) clearInterval(old.game.timer); rooms.delete(oldCode); }
    }
    const safeName=String(name||'Friend').trim().slice(0,18)||'Friend';
    sock.data.roomCode=code; sock.data.playerName=safeName; sock.join(code);
    room.players.set(sock.id,{id:sock.id,name:safeName,score:0});
    if(typeof reply==='function') reply({ok:true,code,strokes:room.strokes,players:[...room.players.values()]});
    io.to(code).emit('players',[...room.players.values()]); io.to(code).emit('notice',`${safeName} joined the board`); broadcastGame(code);
    if(room.game.active) { sock.emit('word-game-started',{round:room.game.round,drawerId:room.game.drawerId,drawerName:room.players.get(room.game.drawerId)?.name||'',endsAt:room.game.endsAt}); if(sock.id===room.game.drawerId) sock.emit('your-word',{word:room.game.word}); }
  }
  socket.on('draw', stroke => {
    const code=socket.data.roomCode; if(!code||!rooms.has(code)||!stroke||!Array.isArray(stroke.points)) return;
    const room=rooms.get(code);
    if(room.game.active && socket.id!==room.game.drawerId) return;
    const clean={color:String(stroke.color||'#202124').slice(0,20),width:Math.max(1,Math.min(30,Number(stroke.width)||4)),points:stroke.points.slice(0,4000).map(p=>({x:Math.max(0,Math.min(1,Number(p.x)||0)),y:Math.max(0,Math.min(1,Number(p.y)||0))}))};
    room.strokes.push(clean); if(room.strokes.length>5000) room.strokes.shift(); socket.to(code).emit('draw',clean);
  });
  socket.on('clear-board',()=>{const code=socket.data.roomCode;if(!code||!rooms.has(code))return;const room=rooms.get(code);if(room.game.active && socket.id!==room.game.drawerId)return;room.strokes=[];io.to(code).emit('clear-board');io.to(code).emit('notice',`${socket.data.playerName||'Someone'} cleared the board`);});
  socket.on('start-word-game',()=>{const code=socket.data.roomCode;if(!code||!rooms.has(code))return;const room=rooms.get(code);if(room.players.size<2){socket.emit('notice','Invite at least one friend to play Draw & Guess.');return;}if(room.game.active)return;room.players.forEach(p=>p.score=0);room.game.round=0;room.game.drawerId=null;startRound(code);});
  socket.on('next-word-round',()=>{const code=socket.data.roomCode;if(!code||!rooms.has(code)||rooms.get(code).game.active)return;startRound(code);});
  socket.on('guess-word',rawGuess=>{
    const code=socket.data.roomCode;if(!code||!rooms.has(code))return;const room=rooms.get(code),g=room.game;
    if(!g.active||socket.id===g.drawerId||g.guessed.has(socket.id))return;
    const guess=String(rawGuess||'').trim().toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ');
    const answer=g.word.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ');
    if(!guess)return;
    if(guess===answer){g.guessed.add(socket.id);const player=room.players.get(socket.id);if(player)player.score=(player.score||0)+10;const drawer=room.players.get(g.drawerId);if(drawer)drawer.score=(drawer.score||0)+5;
      io.to(code).emit('word-correct',{playerName:room.players.get(socket.id)?.name||'Someone',drawerName:drawer?.name||'Drawer'});broadcastGame(code);endRound(code,'guessed');
    } else socket.emit('guess-result',{correct:false,message:'Not quite. Keep guessing!'});
  });
  socket.on('disconnect',()=>{const code=socket.data.roomCode;if(!code||!rooms.has(code))return;const room=rooms.get(code);room.players.delete(socket.id);if(room.game.active&&room.game.drawerId===socket.id)endRound(code,'drawer-left');io.to(code).emit('players',[...room.players.values()]);io.to(code).emit('notice',`${socket.data.playerName||'A friend'} left the board`);broadcastGame(code);if(!room.players.size){if(room.game.timer)clearInterval(room.game.timer);rooms.delete(code);}});
});
server.listen(PORT,()=>console.log(`Scramble Guys running at http://localhost:${PORT}`));
