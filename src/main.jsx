import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, ArrowUpRight, Award, BookOpen, Code2, Gamepad2, Keyboard, Play, RotateCcw, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import './style.css';

const PYTHON = ['NumPy','Pandas','Django','Flask','PyTorch','SciPy','FastAPI','Matplotlib','Requests','TensorFlow'];
const JAVASCRIPT = ['React','Vue','Express','Lodash','Next.js','Svelte','Angular'];
const JAVA = ['Spring','Hibernate','JUnit','Maven','Guava','Log4j'];
const ALL = [...PYTHON.map(label => ({label, kind:'python'})), ...JAVASCRIPT.map(label => ({label, kind:'javascript'})), ...JAVA.map(label => ({label, kind:'java'}))];
const GAME_SECONDS = 45;
const BASKET_SPEED = 55;
const WRONG_CATCH_SLOW_MS = 400;
const WRONG_CATCH_SPEED = .4;
const MAX_USER_DROP_BONUS = 30;
const DROP_BONUS_INTERVAL_MS = 800;
const STORAGE_KEY = 'pycatch-leaderboard-v1';
const getGamepadDirection = () => {
  try {
    const pad = [...(navigator.getGamepads?.() || [])].find(gamepad => gamepad?.connected);
    if (!pad) return 0;
    if (pad.mapping === 'standard' && pad.buttons[14]?.pressed) return -1;
    if (pad.mapping === 'standard' && pad.buttons[15]?.pressed) return 1;
    const axis = pad.axes[0] || 0;
    return Math.abs(axis) > .25 ? Math.sign(axis) : 0;
  } catch { return 0; }
};
const readScores = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } };
const randomItem = () => {
  const pool = Math.random() < .48 ? ALL.slice(0, PYTHON.length) : ALL.slice(PYTHON.length);
  return {...pool[Math.floor(Math.random() * pool.length)], id: Math.random().toString(36).slice(2), x: 8 + Math.random() * 78, y: -12, speed: 19 + Math.random() * 8};
};

function App() {
  const [page, setPage] = useState('home');
  const [scores, setScores] = useState(readScores);
  const [game, setGame] = useState({time:GAME_SECONDS, score:0, caught:0, missed:0, boosts:0, userDropBonus:0, dropSpeedPercent:100, x:50, items:[]});
  const [muted, setMuted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [hit, setHit] = useState(null);
  const [shake, setShake] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const gameRef = useRef(game);
  const keys = useRef({left:false,right:false,downS:false,downArrow:false});
  const lastFrame = useRef(0);
  const dropHoldStart = useRef(null);
  const dropHoldTicks = useRef(0);
  const spawnTime = useRef(0);
  const nameRef = useRef(null);
  const slowUntil = useRef(0);
  const arenaRef = useRef(null);
  const gamePageRef = useRef(null);
  const touchTarget = useRef(null);
  const hitTimer = useRef(null);
  const shakeTimer = useRef(null);
  const saved = useRef(false);
  const audioRef = useRef(null);
  gameRef.current = game;

  function sound(kind) {
    if (muted) return;
    try {
      const ctx = audioRef.current || (audioRef.current = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === 'suspended') ctx.resume();
      const tone = (frequency, start, duration, type='sine') => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(frequency, ctx.currentTime + start);
        gain.gain.setValueAtTime(.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(kind === 'bad' ? .07 : .09, ctx.currentTime + start + .01);
        gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + start + duration);
        osc.connect(gain).connect(ctx.destination); osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + duration);
      };
      if (kind === 'boost') { tone(587, 0, .12); tone(880, .11, .15); tone(1175, .23, .24); }
      else if (kind === 'good') { tone(740, 0, .12); tone(988, .11, .18); tone(1318, .23, .22); }
      else { tone(220, 0, .15, 'sawtooth'); tone(165, .12, .22, 'sawtooth'); }
    } catch { /* audio is optional */ }
  }

  function showHit(kind, item) {
    clearTimeout(hitTimer.current); clearTimeout(shakeTimer.current);
    setHit({id:item.id, kind, label:item.label, x:item.x, y:item.y});
    if (kind === 'bad') { setShake(true); shakeTimer.current = setTimeout(() => setShake(false), 380); }
    hitTimer.current = setTimeout(() => setHit(null), 650);
    sound(kind);
  }

  function startGame() {
    if (!playerName.trim()) {
      setPage('home'); setNameError(true);
      setTimeout(() => nameRef.current?.focus(), 0);
      return;
    }
    saved.current = false; keys.current = {left:false,right:false,downS:false,downArrow:false}; dropHoldStart.current = null; dropHoldTicks.current = 0; touchTarget.current = null;
    setNameError(false); setHit(null); setShake(false); slowUntil.current = 0;
    setGame({time:GAME_SECONDS, score:0, caught:0, missed:0, boosts:0, userDropBonus:0, dropSpeedPercent:100, x:50, items:[]});
    lastFrame.current = 0; spawnTime.current = 0; setPage('game');
  }

  useEffect(() => {
    if (page === 'game') gamePageRef.current?.focus();
    else { keys.current = {left:false,right:false,downS:false,downArrow:false}; dropHoldStart.current = null; dropHoldTicks.current = 0; }
  }, [page]);

  function handleGameKeyDown(e) {
    if (e.isComposing || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') { keys.current.left = true; e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') { keys.current.right = true; e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
      keys.current[e.key === 'ArrowDown' ? 'downArrow' : 'downS'] = true;
      e.preventDefault();
    }
  }

  function handleGameKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.current.left = false;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.current.right = false;
    if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
      keys.current[e.key === 'ArrowDown' ? 'downArrow' : 'downS'] = false;
      if (!keys.current.downS && !keys.current.downArrow) { dropHoldStart.current = null; dropHoldTicks.current = 0; }
    }
  }

  useEffect(() => {
    const updateGamepad = () => {
      try { setGamepadConnected([...(navigator.getGamepads?.() || [])].some(pad => pad?.connected)); }
      catch { setGamepadConnected(false); }
    };
    updateGamepad();
    window.addEventListener('gamepadconnected', updateGamepad);
    window.addEventListener('gamepaddisconnected', updateGamepad);
    return () => {
      window.removeEventListener('gamepadconnected', updateGamepad);
      window.removeEventListener('gamepaddisconnected', updateGamepad);
    };
  }, []);

  useEffect(() => {
    if (page !== 'game') return;
    const saveOnExit = () => saveScore(gameRef.current, false);
    const clearHeldKeys = () => { keys.current = {left:false,right:false,downS:false,downArrow:false}; dropHoldStart.current = null; dropHoldTicks.current = 0; };
    window.addEventListener('blur', clearHeldKeys);
    window.addEventListener('pagehide', saveOnExit);
    let raf;
    const frame = timestamp => {
      if (!lastFrame.current) lastFrame.current = timestamp;
      const dt = Math.min((timestamp - lastFrame.current) / 1000, .05);
      lastFrame.current = timestamp; spawnTime.current += dt;
      const shouldSpawn = spawnTime.current >= .76;
      if (shouldSpawn) spawnTime.current = 0;
      const prev = gameRef.current;
        const time = Math.max(0, prev.time - dt);
        const slowFactor = timestamp < slowUntil.current ? WRONG_CATCH_SPEED : 1;
        const baseDropPercent = prev.time <= 5 ? 200 : prev.time <= 10 ? 180 : prev.time <= 15 ? 130 : 100;
        const holdingDropKey = keys.current.downS || keys.current.downArrow;
        if (holdingDropKey && dropHoldStart.current === null) dropHoldStart.current = timestamp;
        const heldTicks = holdingDropKey ? Math.floor((timestamp - dropHoldStart.current) / DROP_BONUS_INTERVAL_MS) : 0;
        const userDropBonus = Math.min(MAX_USER_DROP_BONUS, prev.userDropBonus + Math.max(0, heldTicks - dropHoldTicks.current));
        dropHoldTicks.current = heldTicks;
        const dropSpeedMultiplier = (baseDropPercent + userDropBonus) / 100 * slowFactor;
        const dropSpeedPercent = Math.round((baseDropPercent + userDropBonus) * slowFactor);
        const keyboardDirection = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
        const direction = Math.sign(keyboardDirection + getGamepadDirection());
        const touchDistance = touchTarget.current === null ? null : touchTarget.current - prev.x;
        const basketSpeed = BASKET_SPEED * (1 + prev.boosts * .15) * slowFactor;
        const movement = touchDistance === null ? direction * basketSpeed * dt : Math.sign(touchDistance) * Math.min(Math.abs(touchDistance), basketSpeed * dt);
        const x = Math.max(9, Math.min(91, prev.x + movement));
        let score = prev.score, caught = prev.caught, missed = prev.missed;
        let boosts = prev.boosts;
        let wrongThisFrame = false;
        const arenaHeight = arenaRef.current?.clientHeight || 400;
        const catchY = (arenaHeight - 94) / arenaHeight * 100;
        const starDrops = [30, 15].filter(mark => prev.time > mark && time <= mark).map(mark => ({id:`ai-star-${mark}`, label:'AI+', kind:'boost', x:8 + Math.random() * 78, y:-12, speed:23}));
        const items = [...prev.items, ...(shouldSpawn ? [randomItem()] : []), ...starDrops].map(item => ({...item, y:item.y + item.speed * dropSpeedMultiplier * dt})).filter(item => {
          if (!wrongThisFrame && item.y >= catchY && item.y <= catchY + 8 && Math.abs(item.x - x) < 10) {
            const kind = item.kind === 'boost' ? 'boost' : item.kind === 'python' ? 'good' : 'bad';
            if (kind === 'boost') boosts++;
            else { score += kind === 'good' ? 10 : -5; caught += kind === 'good' ? 1 : 0; missed += kind === 'bad' ? 1 : 0; }
            showHit(kind, item);
            if (kind === 'bad') { slowUntil.current = timestamp + WRONG_CATCH_SLOW_MS; wrongThisFrame = true; }
            return false;
          }
          if (item.y > 104) { if (item.kind === 'python') missed++; return false; }
          return true;
        });
        const next = {time, score:Math.max(0,score), caught, missed, boosts, userDropBonus, dropSpeedPercent, x, items};
        gameRef.current = next;
        setGame(next);
        if (time === 0) { saveScore(next, true); setPage('result'); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pagehide', saveOnExit); window.removeEventListener('blur', clearHeldKeys); clearHeldKeys(); lastFrame.current = 0; };
  }, [page, muted]);

  useEffect(() => () => { clearTimeout(hitTimer.current); clearTimeout(shakeTimer.current); }, []);

  function saveScore(snapshot = gameRef.current, completed = false) {
    if (saved.current) return;
    const name = playerName.trim().slice(0, 18);
    const next = [...readScores(), {name, score:snapshot.score, caught:snapshot.caught, completed, date:new Date().toISOString()}].sort((a,b) => b.score-a.score);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setScores(next); saved.current = true;
  }

  function navigate(destination) {
    if (page === 'game') saveScore(gameRef.current, false);
    setPage(destination);
  }

  function resetGame() {
    if (!window.confirm('Reset the game? This will clear all scores saved on this device and the current player name.')) return;
    localStorage.removeItem(STORAGE_KEY);
    setScores([]);
    setPlayerName('');
    setNameError(false);
    setGame({time:GAME_SECONDS, score:0, caught:0, missed:0, boosts:0, userDropBonus:0, dropSpeedPercent:100, x:50, items:[]});
    saved.current = false;
  }

  function aimTouch(e) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    const bounds = e.currentTarget.getBoundingClientRect();
    touchTarget.current = Math.max(9, Math.min(91, (e.clientX - bounds.left) / bounds.width * 100));
  }

  return <div className={`app-shell ${page === 'game' ? 'game-active' : ''}`}>
    <header className="site-header"><button className="brand" onClick={() => navigate('home')} aria-label="PyCatch home"><span className="brand-mark"><Code2 size={22} strokeWidth={2.7}/></span><span>py<span className="brand-accent">catch</span><span className="brand-dot">.</span></span></button><nav><button className={page==='home'?'active':''} onClick={() => navigate('home')}>Home</button><button className={page==='leaderboard'?'active':''} onClick={() => navigate('leaderboard')}>Leaderboard</button></nav><button className="sound-button" onClick={() => setMuted(!muted)} aria-label={muted?'Unmute':'Mute'}>{muted?<VolumeX size={19}/>:<Volume2 size={19}/>}</button></header>
    {page === 'home' && <main className="home"><div className="home-copy"><div className="eyebrow"><span className="live-dot"/> THE LIBRARY CATCHING GAME</div><h1>Think fast.<br/><span>Catch Python.</span></h1><p className="intro">Libraries are falling from the sky. Move your basket, grab the Python ones, and dodge the rest. You have 45 seconds to prove your skills.</p><div className="name-entry"><label htmlFor="player-name">YOUR NAME TO PLAY</label><input id="player-name" ref={nameRef} value={playerName} maxLength={18} placeholder="Enter your name" aria-invalid={nameError} onChange={e=>{setPlayerName(e.target.value);setNameError(false)}} onKeyDown={e=>{if(e.key==='Enter')startGame()}}/>{nameError&&<small>Please enter your name to start.</small>}</div><div className="hero-actions"><button className="primary-button" onClick={startGame}><Play size={18} fill="currentColor"/> Play now <ArrowUpRight size={18}/></button><button className="text-button" onClick={() => setPage('leaderboard')}>View leaderboard <ArrowRight size={18}/></button></div><a className="jetbrains-credit" href="https://www.jetbrains.com/" target="_blank" rel="noopener noreferrer" aria-label="Visit JetBrains"><img src={`${import.meta.env.BASE_URL}jetbrains.svg`} alt="JetBrains"/></a><div className="quick-stats"><div><strong>45<span>s</span></strong><small>on the clock</small></div><div><strong>+10</strong><small>per Python library</small></div><div><strong>−5</strong><small>for a wrong catch</small></div></div></div><div className="hero-art"><div className="art-grid"/><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="floating-card card-numpy"><span className="card-icon python-icon">Py</span><span>NumPy</span><span className="mini-check">✓</span></div><div className="floating-card card-react"><span className="card-icon react-icon">✳</span><span>React</span><span className="mini-cross">×</span></div><div className="floating-card card-django"><span className="card-icon django-icon">Dj</span><span>Django</span><span className="mini-check">✓</span></div><div className="floating-card card-spring"><span className="card-icon spring-icon">S</span><span>Spring</span><span className="mini-cross">×</span></div><div className="hero-basket"><div className="basket-rim"/><div className="basket-body"><div className="basket-panel red"/><div className="basket-panel blue"/><span className="basket-logo"><img src={`${import.meta.env.BASE_URL}pyconlogo.svg`} alt="PyCon HK 2026"/></span></div></div><div className="art-caption"><span className="caption-spark">✦</span> ONLY PYTHON MAKES THE CUT</div></div><div className="how-to"><div className="section-label">HOW TO PLAY <span>·</span> THREE SIMPLE STEPS</div><div className="steps"><div className="step"><span className="step-icon"><Keyboard size={22}/></span><div><h3>Move your basket</h3><p>Use ← →, A / D, a gamepad, or touch controls. Hold S or ↓ to increase drop speed by 1% every second.</p></div></div><div className="step"><span className="step-icon"><BookOpen size={22}/></span><div><h3>Spot the Python libs</h3><p>Catch Python libraries and AI+ stars. Let Java and JavaScript pass.</p></div></div><div className="step"><span className="step-icon"><Trophy size={22}/></span><div><h3>Beat the clock</h3><p>Score as many points as you can in 45 seconds.</p></div></div></div></div><button className="reset-game-button" onClick={resetGame}><RotateCcw size={16}/> Reset game</button></main>}
    {page === 'game' && <main className="game-page" ref={gamePageRef} tabIndex={-1} onKeyDown={handleGameKeyDown} onKeyUp={handleGameKeyUp} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){keys.current={left:false,right:false,downS:false,downArrow:false};dropHoldStart.current=null;dropHoldTicks.current=0}}}><a className="game-jetbrains-banner" href="https://www.jetbrains.com/" target="_blank" rel="noopener noreferrer" aria-label="Visit JetBrains"><img src={`${import.meta.env.BASE_URL}jetbrains.svg`} alt="JetBrains"/><span>THE LIBRARY CATCHING GAME</span></a><div className="game-topline"><div><div className="eyebrow"><span className="live-dot"/> GAME IN PROGRESS</div><h1>Catch the <span>Python Library.</span></h1></div><button className="quit-button" onClick={() => navigate('home')}><X size={17}/> Quit game</button></div><div className="game-stats"><div><span>YOUR SCORE</span><strong>{game.score}</strong></div><div><span>TIME LEFT</span><strong className={game.time<10?'urgent':''}>{Math.ceil(game.time)}<small>s</small></strong></div><div><span>PYTHON CAUGHT</span><strong>{game.caught}</strong></div><div className="drop-speed-stat"><span>DROP SPEED</span><strong>{game.dropSpeedPercent}<small>%</small></strong></div></div><div ref={arenaRef} className={`arena ${shake ? 'arena-shake' : ''}`} onPointerDown={e=>{if(e.pointerType==='touch'||e.pointerType==='pen'){e.currentTarget.setPointerCapture(e.pointerId);aimTouch(e)}}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))aimTouch(e)}} onPointerUp={()=>{touchTarget.current=null}} onPointerCancel={()=>{touchTarget.current=null}} role="application" aria-label="Catch Python libraries with your basket"><div className="arena-grid"/><div className={`arena-top ${game.time <= 15 ? 'speed-up' : ''}`}>{game.time <= 5 ? '⚡ FINAL 5 SECONDS' : game.time <= 10 ? '⚡ FINAL 10 SECONDS' : game.time <= 15 ? '⚡ SPEED UP' : '↓ ITEMS ARE FALLING'}</div>{game.items.map(item => <div key={item.id} className={`falling-item ${item.kind}`} style={{left:`${item.x}%`,top:`${item.y}%`}}>{item.kind === 'boost' ? <img className="star-image" src={`${import.meta.env.BASE_URL}ai-star.svg`} alt=""/> : <span className="item-dot"/>}{item.label}</div>)}{hit&&<div key={hit.id} className={`hit-effect ${hit.kind}`} style={{left:`${hit.x}%`,top:`${hit.y}%`}}><span className="hit-ring"/><span className="hit-particles">✦ ✧ ✦</span><strong>{hit.kind === 'boost' ? '+15% BASKET SPEED' : hit.kind === 'good' ? `+10 ${hit.label}` : `−5 ${hit.label}`}</strong><span className="hit-word">{hit.kind === 'boost' ? 'SPEED UP!' : hit.kind === 'good' ? 'BING BING!' : 'WRONG LIBRARY!'}</span></div>}<div className={`game-basket ${hit ? (hit.kind === 'bad' ? 'basket-bad' : 'basket-good') : ''}`} style={{left:`${game.x}%`}}><div className="basket-rim"/><div className="basket-body"><div className="basket-panel red"/><div className="basket-panel blue"/><span className="basket-logo"><img src={`${import.meta.env.BASE_URL}pyconlogo.svg`} alt="PyCon HK 2026"/></span></div></div><div className="arena-floor"/></div><div className="game-foot"><span><span className="green-dot"/> Catch Python <span className="foot-divider">·</span> Avoid Java & JavaScript <span className="foot-divider">·</span> Basket speed {Math.round((1 + game.boosts * .15) * 100)}%</span><div className="touch-controls"><button onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);keys.current.left=true}} onPointerUp={()=>keys.current.left=false} onPointerCancel={()=>keys.current.left=false} aria-label="Move left"><ArrowLeft size={24} strokeWidth={2.5}/></button><button onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);keys.current.right=true}} onPointerUp={()=>keys.current.right=false} onPointerCancel={()=>keys.current.right=false} aria-label="Move right"><ArrowRight size={24} strokeWidth={2.5}/></button></div><span className="desktop-hint">{gamepadConnected ? <><Gamepad2 size={16}/> Controller connected · left stick / D-pad</> : '← → · A / D to move · hold S / ↓ to boost drops'}</span></div></main>}
    {page === 'result' && <main className="result-page"><div className="result-icon"><Award size={34}/></div><div className="eyebrow">TIME'S UP · NICE WORK</div><h1>Game Over</h1><p>Your 45-second run is complete. Your score has been saved automatically.</p><div className="result-score"><span>FINAL SCORE</span><strong>{game.score}</strong><small>{game.caught} Python libraries caught</small></div><div className="result-player">Playing as <strong>{playerName}</strong></div><button className="primary-button result-save" onClick={() => setPage('leaderboard')}>View leaderboard <ArrowRight size={18}/></button><button className="text-button" onClick={() => setPage('home')}><ArrowLeft size={17}/> Home</button></main>}
    {page === 'leaderboard' && <main className="leaderboard-page"><div className="leader-head"><div><div className="eyebrow"><span className="live-dot"/> HALL OF FAME</div><h1>The <span>leaderboard.</span></h1><p>Top Python catchers, right here on this device.</p></div><button className="primary-button" onClick={startGame}><Play size={17} fill="currentColor"/> Play game <ArrowUpRight size={18}/></button></div><div className="leader-card"><div className="leader-header"><span>RANK / PLAYER</span><span>PYTHON CAUGHT</span><span>SCORE</span></div>{scores.length ? scores.map((entry,i)=><div className="leader-row" key={`${entry.date}-${i}`}><div className="leader-name"><span className={`rank rank-${i+1}`}>{i===0?'✦':String(i+1).padStart(2,'0')}</span><span>{entry.name}</span>{i===0&&<span className="top-badge">TOP CATCHER</span>}</div><span className="caught-count">{entry.caught}</span><strong>{entry.score}</strong></div>) : <div className="empty-board"><Trophy size={38}/><h2>No scores yet</h2><p>Be the first to catch some Python libraries.</p><button className="primary-button" onClick={startGame}>Start playing <ArrowRight size={17}/></button></div>}</div><button className="back-link" onClick={() => setPage('home')}><ArrowLeft size={17}/> Back to home</button></main>}
    {page !== 'game' && <footer className="site-footer"><span>© 2026 pycatch. Made for curious minds. <a href="https://www.jetbrains.com/company/brand/" target="_blank" rel="noopener noreferrer">JetBrains logo © 2026 JetBrains s.r.o.</a></span><span>Catch code. Have fun. <span className="footer-star">✳</span></span></footer>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
