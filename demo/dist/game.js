(() => {
  'use strict';
  const { Simulation, Gardener, SPECIES, clamp, islandDepth } = GroveCore;
  const $ = id => document.getElementById(id);
  const canvas = $('map'), ctx = canvas.getContext('2d', { alpha: false });
  const tile = 24, worldW = 52 * tile, worldH = 36 * tile;
  const terrain = document.createElement('canvas'); terrain.width = worldW; terrain.height = worldH;
  const ground = terrain.getContext('2d', { alpha: false });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phaseNames = ['风沙孤岛', '零星生机', '草甸蔓延', '林海涌现'];
  const phaseDescriptions = ['海风卷起沙粒，先让耐旱的树苗扎下根。', '少数树木相互庇护，岛上有了第一抹绿。', '野草自己长出来了，动物也开始回到这里。', '溪流润泽林地，这座小岛重新有了生机。'];
  const notes = [
    { title: '01 · 风沙孤岛', text: '海风卷起沙粒，一两棵苗挡不住。先在这座小岛上，种下第一棵。' },
    { title: '02 · 零星生机', text: '总算有一片梭梭活下来了。风还在吹，但彼此之间，已经有了庇护。' },
    { title: '03 · 草甸蔓延', text: '没有人撒下草籽，地上却冒出了野草。今天还看见一只野兔，停在树荫下面。' },
    { title: '04 · 林海涌现', text: '一代人栽下树苗，许多年后，万千生命在此生根。不是奇迹，是无数次没有放弃。' }
  ];
  const sprites = {
    saxaul: ['......g.......','...g..gg..g...','...gg.gg.ggg..','.gggggggggg...','..ggGggGggg...','...ggGgGggg...','..g.ggGgg.g...','...g.GG.g.....','.....tGt......','.....tt.......','......t.......','.....ttt......'],
    willow: ['.....GGGG.....','...GGggggGG...','..GGggggggGG..','.GggggGgggggG.','GGggGGgggGGggG','gGggGgggggGgGg','g.ggGggGggg.gg','..gGggtggGgg..','..g.gtttgg.g..','.....ttt......','......tt......','.....tttt.....'],
    flower: ['....g..g......','..gggg.ggg....','.ggfgggggfg...','..ggGggGgggg..','ggfGggGggfggg.','.ggGgfGggGgg..','..gGggGggGg...','...ggGtGgg....','....gtttg.....','.....ttt......','......tt......','.....tttt.....'],
    seed: ['...g...','..ggg..','.gGgGg.','...t...','...t...','..ttt..'],
    dead: ['..t..t.','...tt..','.t.t...','..ttt..','...t...','..ttt..'],
    rabbit: ['..w.w...','..w.w...','..www...','.wwwww..','wwwwwkw.','.www....','w...w...'],
    mouse: ['..bb....','.bbbbb..','bbbbkb..','.bbbb...','b....b..'],
    gardener: ['....hhhh....','...hhhhhh...','..HHHHHHHH..','....ssss....','....sksk....','.....ss.....','...bbbbbb...','..sbbBBbbs..','..sbbBBbbs..','...bbbbbb...','....pppp....','....p..p....','...kk..kk...']
  };
  const palettes = {
    saxaul: { g: '#658047', G: '#8ca158', t: '#78633e' },
    willow: { g: '#456b3b', G: '#789850', t: '#6c593d' },
    flower: { g: '#6e8552', G: '#9ca76e', f: '#cd938c', t: '#8a704c' },
    seed: { g: '#92a461', G: '#b4bd7b', t: '#7d6946' },
    dead: { t: '#8a7554' }, rabbit: { w: '#d6d2ad', k: '#353e2e' }, mouse: { b: '#8b8161', k: '#303a27' },
    gardener: { h: '#dcc27b', H: '#957449', s: '#e9bc8d', k: '#34372f', b: '#c6774e', B: '#985a3d', p: '#455e69' }
  };
  const bitmap = {};
  for (const [name, rows] of Object.entries(sprites)) {
    const image = document.createElement('canvas'); image.width = rows[0].length; image.height = rows.length;
    const brush = image.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((color, x) => { if (color !== '.') { brush.fillStyle = palettes[name][color]; brush.fillRect(x, y, 1, 1); } }));
    bitmap[name] = image;
  }
  function drawSprite(context, name, x, y, scale = 2, alpha = 1) {
    const image = bitmap[name]; context.globalAlpha = alpha;
    context.drawImage(image, Math.round(x - image.width * scale / 2), Math.round(y - image.height * scale), image.width * scale, image.height * scale);
    context.globalAlpha = 1;
  }
  document.querySelectorAll('.species').forEach(button => {
    const icon = button.querySelector('canvas'), iconCtx = icon.getContext('2d');
    iconCtx.imageSmoothingEnabled = false; drawSprite(iconCtx, button.dataset.species, 24, 40, 2.7);
  });
  let sim = new Simulation(), selected = 'saxaul', speed = 1;
  let player = new Gardener(sim), moveTarget = null, plantHeld = false, plantingUntil = 0;
  const keys = new Set(), touchKeys = new Set();
  let width = 1, height = 1, fit = 1, scale = 1, eco = 0;
  let lastFrame = performance.now(), lastTerrain = -1, lastUi = -1;
  let noteTimer, toastTimer, timers = [], toastDeathShown = false;
  let unlocked = new Set([0]);
  let hover = null, pointer = null, lastPlant = 0;
  const camera = { x: worldW / 2, y: worldH / 2, zoom: 1.08, actualZoom: 1.08 };
  const noise = Array.from({ length: 52 * 36 }, (_, i) => {
    const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n);
  });
  const particles = Array.from({ length: 125 }, (_, i) => ({ x: noise[i * 3], y: noise[i * 3 + 1], speed: 55 + noise[i * 3 + 2] * 100 }));
  const animals = Array.from({ length: 12 }, (_, i) => ({ x: 7 + noise[500 + i] * 38, y: 6 + noise[550 + i] * 24, offset: i * 4.7 }));
  function resize() {
    const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    fit = Math.min(width / worldW, height / worldH) * .98; scale = fit * camera.actualZoom;
  }
  new ResizeObserver(resize).observe(canvas); resize();
  const riverY = x => 25 + Math.round(Math.sin(x * .21) * 2 + Math.sin(x * .47));
  function waterAt(x, y) { return eco > 2.5 && sim.isLand(x, y) && x >= 8 && x <= 46 && Math.abs(y - riverY(x)) <= 1; }
  function rebuildTerrain() {
    const influence = new Float32Array(sim.cells.length);
    if (eco > .05) for (const tree of sim.cells) if (tree && tree.state === 'live') {
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        const x = tree.x + dx, y = tree.y + dy, distance = Math.hypot(dx, dy);
        if (x >= 0 && y >= 0 && x < sim.cols && y < sim.rows && distance < 5) influence[y * sim.cols + x] += (1 - distance / 5) * SPECIES[tree.species].soil;
      }
    }
    const blend = (a, b, amount) => Math.round(a + (b - a) * amount);
    for (let y = 0; y < sim.rows; y++) for (let x = 0; x < sim.cols; x++) {
      const index = y * sim.cols + x, n = noise[index];
      const depth = islandDepth(x, y);
      if (!sim.isLand(x, y)) {
        ground.fillStyle = depth > -.12 ? '#579998' : n > .5 ? '#407c83' : '#3d777f';
        ground.fillRect(x * tile, y * tile, tile, tile);
        if (n > .64) { ground.fillStyle = '#95c7b755'; ground.fillRect(x * tile + 3, y * tile + 11, 14, 2); }
        if (depth > -.055) { ground.fillStyle = '#c3dbc4'; ground.fillRect(x * tile + 4, y * tile + 7, 13, 3); }
        continue;
      }
      if (depth < .095) {
        ground.fillStyle = n > .5 ? '#d9c598' : '#d0bc8d'; ground.fillRect(x * tile, y * tile, tile, tile);
        ground.fillStyle = '#a98c5c45'; ground.fillRect(x * tile + 5, y * tile + 14, 6, 2); continue;
      }
      const green = clamp((Math.max(0, eco - 1.1) * .44 + influence[index] * .045 * Math.min(eco, 1)) * (.55 + n * .6), 0, .96);
      const shade = Math.round(n * 12 - 6 + Math.sin(x * .24 + y * .39) * 4);
      ground.fillStyle = `rgb(${blend(202 + shade, 94 + shade, green)},${blend(176 + shade, 129 + shade, green)},${blend(122 + shade, 67 + shade, green)})`;
      ground.fillRect(x * tile, y * tile, tile, tile);
      ground.fillStyle = green > .24 ? '#52763a35' : '#98784528';
      ground.fillRect(x * tile + Math.floor(n * 15) + 2, y * tile + 5, 5, 2);
      ground.fillRect(x * tile + 15, y * tile + Math.floor(n * 13) + 5, 3, 2);
      ground.fillStyle = green > .35 ? '#9cb86a55' : '#e4c99540';
      ground.fillRect(x * tile + 4, y * tile + 17, 7, 2);
      if (green > .28 && n > .48) {
        ground.fillStyle = '#55793e'; const px = x * tile + 7 + Math.floor(n * 6), py = y * tile + 12;
        ground.fillRect(px, py, 2, 6); ground.fillRect(px - 3, py + 1, 2, 4); ground.fillRect(px + 3, py - 1, 2, 5);
      }
    }
    if (eco > 2.05) {
      ground.globalAlpha = clamp((eco - 2.05) / .9, 0, 1);
      for (let x = 8; x <= 46; x++) {
        const y = riverY(x), xx = x * tile;
        if (!sim.isLand(x, y - 1) || !sim.isLand(x, y + 1)) continue;
        ground.fillStyle = '#b0ba77'; ground.fillRect(xx, (y - 1) * tile, tile, tile * 3);
        ground.fillStyle = '#6b9c91'; ground.fillRect(xx, y * tile - 8, tile, tile + 14);
        ground.fillStyle = '#83b1a1'; ground.fillRect(xx, y * tile - 3, tile, 8);
        if (x % 3 === 0) { ground.fillStyle = '#bad6b1'; ground.fillRect(xx + 4, y * tile + 9, 10, 2); }
        if (x % 4 === 0) { ground.fillStyle = '#476e45'; ground.fillRect(xx + 15, (y + 1) * tile + 8, 3, 12); ground.fillRect(xx + 19, (y + 1) * tile + 6, 2, 10); }
      }
      ground.globalAlpha = 1;
    }
  }
  function worldPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left - width / 2) / scale + camera.x, y: (clientY - rect.top - height / 2) / scale + camera.y };
  }
  function showToast(text) {
    clearTimeout(toastTimer); $('toast').textContent = text; $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2100);
  }
  function plantNearPlayer(notify = true) {
    const planted = player.plant(selected, waterAt); lastPlant = performance.now();
    if (planted) { plantingUntil = lastPlant + 250; $('empty-hint').style.opacity = 0; return true; }
    if (notify) showToast('身边已经种满了，走几步再种吧。');
    return false;
  }
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.button !== 2) return;
    canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, pan: event.button === 2, x: event.clientX, y: event.clientY };
    hover = worldPoint(event.clientX, event.clientY);
    if (pointer.pan) canvas.style.cursor = 'grabbing';
    else if (sim.isLand(Math.floor(hover.x / tile), Math.floor(hover.y / tile))) {
      moveTarget = { x: hover.x / tile, y: hover.y / tile };
    } else showToast('海岸就是边界。我们先让这一座岛长出森林。');
  });
  canvas.addEventListener('pointermove', event => {
    if (pointer && event.pointerId !== pointer.id) return;
    if (pointer?.pan) {
      camera.x = clamp(camera.x - (event.clientX - pointer.x) / scale, 0, worldW);
      camera.y = clamp(camera.y - (event.clientY - pointer.y) / scale, 0, worldH);
      pointer.x = event.clientX; pointer.y = event.clientY;
    }
    hover = worldPoint(event.clientX, event.clientY);
  });
  function releasePointer(event) {
    if (pointer && event.pointerId !== pointer.id) return;
    pointer = null; canvas.style.cursor = 'default';
  }
  canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', () => { pointer = null; });
  canvas.addEventListener('pointerleave', () => { if (!pointer) hover = null; });
  canvas.addEventListener('wheel', event => {
    event.preventDefault(); camera.zoom = clamp(camera.zoom * Math.exp(-event.deltaY * .001), .65, 3);
  }, { passive: false });
  function selectSpecies(name) {
    selected = name;
    document.querySelectorAll('.species').forEach(button => {
      const active = button.dataset.species === name; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    });
  }
  document.querySelectorAll('.species').forEach(button => button.addEventListener('click', () => selectSpecies(button.dataset.species)));
  const moveKeys = new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
  const plantingKeys = new Set(['e',' ','enter']);
  window.addEventListener('keydown', event => {
    if ($('journal').open) return;
    if (['1', '2', '3'].includes(event.key)) selectSpecies(['saxaul','willow','flower'][Number(event.key) - 1]);
    const key = event.key.toLowerCase();
    if (moveKeys.has(key) || plantingKeys.has(key)) {
      if (key === 'enter' && document.activeElement !== canvas && document.activeElement !== $('plant-button')) return;
      event.preventDefault(); keys.add(key);
      if (moveKeys.has(key)) {
        moveTarget = null; $('empty-hint').style.opacity = 0;
        if (!event.repeat) player.walk(Number(key === 'd' || key === 'arrowright') - Number(key === 'a' || key === 'arrowleft'), Number(key === 's' || key === 'arrowdown') - Number(key === 'w' || key === 'arrowup'), .04);
      }
      if (plantingKeys.has(key) && !event.repeat) plantNearPlayer();
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  function clearControls() { pointer = null; plantHeld = false; keys.clear(); touchKeys.clear(); canvas.style.cursor = 'default'; }
  window.addEventListener('blur', clearControls);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearControls(); });
  const directions = { up: 'arrowup', left: 'arrowleft', down: 'arrowdown', right: 'arrowright' };
  document.querySelectorAll('[data-move]').forEach(button => {
    const key = directions[button.dataset.move];
    button.addEventListener('pointerdown', event => {
      event.preventDefault(); button.setPointerCapture(event.pointerId); touchKeys.add(key); moveTarget = null; $('empty-hint').style.opacity = 0;
      player.walk(Number(key === 'arrowright') - Number(key === 'arrowleft'), Number(key === 'arrowdown') - Number(key === 'arrowup'), .04);
    });
    const release = () => touchKeys.delete(key);
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  });
  $('plant-button').addEventListener('pointerdown', event => { event.preventDefault(); $('plant-button').setPointerCapture(event.pointerId); plantHeld = true; plantNearPlayer(); });
  const releasePlant = () => { plantHeld = false; };
  $('plant-button').addEventListener('pointerup', releasePlant); $('plant-button').addEventListener('pointercancel', releasePlant); $('plant-button').addEventListener('lostpointercapture', releasePlant);
  $('plant-button').addEventListener('click', event => { if (event.detail === 0) plantNearPlayer(); });
  $('zoom-in').addEventListener('click', () => { camera.zoom = clamp(camera.zoom * 1.25, .65, 3); });
  $('zoom-out').addEventListener('click', () => { camera.zoom = clamp(camera.zoom / 1.25, .65, 3); });
  $('zoom-fit').addEventListener('click', () => { camera.zoom = .98; camera.x = worldW / 2; camera.y = worldH / 2; });
  $('speed').addEventListener('click', () => {
    speed = speed === 1 ? 4 : 1;
    $('speed').innerHTML = `时间 ×${speed} <span>${speed === 1 ? '加速等待' : '恢复常速'}</span>`;
  });
  function showNote(index) {
    clearTimeout(noteTimer); $('note-title').textContent = `造林手记 · ${notes[index].title}`;
    $('note-text').textContent = notes[index].text; $('note').classList.remove('faded');
    noteTimer = setTimeout(() => $('note').classList.add('faded'), 12000);
  }
  function updateJournal() {
    $('journal-count').textContent = unlocked.size;
    $('journal-entries').replaceChildren(...[...unlocked].sort().map(index => {
      const entry = document.createElement('article'); entry.className = 'journal-entry';
      const heading = document.createElement('h3'); heading.textContent = notes[index].title;
      const text = document.createElement('p'); text.textContent = notes[index].text; entry.append(heading, text); return entry;
    }));
  }
  $('journal-button').addEventListener('click', () => { clearControls(); moveTarget = null; updateJournal(); $('journal').showModal(); });
  $('close-journal').addEventListener('click', () => $('journal').close());
  $('journal').addEventListener('click', event => { if (event.target === $('journal')) { const r = $('journal').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('journal').close(); } });
  function beginEnding() {
    camera.zoom = .98; camera.x = worldW / 2; camera.y = worldH / 2;
    timers.push(setTimeout(() => { $('ending').classList.add('visible'); $('ending').setAttribute('aria-hidden', 'false'); }, reducedMotion ? 100 : 3200));
    timers.push(setTimeout(() => { $('ending').classList.remove('visible'); $('ending').setAttribute('aria-hidden', 'true'); showNote(3); showToast('绿洲已经涌现，你还可以继续种树。'); }, 12000));
  }
  $('restart').addEventListener('click', () => {
    for (const timer of timers) clearTimeout(timer); timers = [];
    clearTimeout(toastTimer); $('toast').classList.remove('visible');
    sim = new Simulation(); player = new Gardener(sim); moveTarget = null; plantingUntil = 0; clearControls(); eco = 0; hover = null; toastDeathShown = false;
    camera.x = worldW / 2; camera.y = worldH / 2; camera.zoom = camera.actualZoom = 1.08;
    $('ending').classList.remove('visible'); $('ending').setAttribute('aria-hidden', 'true');
    $('empty-hint').style.opacity = 1; unlocked = new Set([0]); updateJournal(); showNote(0);
    lastTerrain = -1; lastUi = -1; updateUi(); rebuildTerrain();
  });
  function updateUi() {
    $('live-count').textContent = sim.live; $('seed-count').textContent = sim.seedlings; $('dead-count').textContent = sim.dead;
    $('phase-name').textContent = phaseNames[sim.phase]; $('phase-description').textContent = phaseDescriptions[sim.phase];
    const wind = Math.round(sim.wind * 100); $('wind-label').textContent = wind + '%'; $('wind-bar').style.width = wind + '%';
    $('wind-bar').style.background = sim.phase >= 2 ? '#789563' : '#b39864';
    for (const name of Object.keys(SPECIES)) $('chance-' + name).textContent = Math.round(sim.survival(name, Math.floor(player.x), Math.floor(player.y)) * 100) + '%';
    $('player-position').textContent = `造林者 · 岛内 ${Math.floor(player.x)}, ${Math.floor(player.y)}`;
    $('progress-label').textContent = `${sim.live} / 80`; $('progress-bar').style.width = Math.min(100, sim.live / 80 * 100) + '%';
    document.querySelectorAll('.milestones li').forEach(li => li.classList.toggle('active', Number(li.dataset.phase) <= sim.phase));
    const next = [12,36,80][sim.phase];
    $('next-milestone').textContent = sim.phase === 3 ? '水源已经归来。继续种植，让这片林海留下来。' : `再让 ${Math.max(0, next - sim.live)} 棵树扎根，${['第一片绿色就会出现。','野草和小动物就会归来。','溪流就会重新润泽土地。'][sim.phase]}`;
  }
  function drawAnimals() {
    if (eco > 1.55) {
      const alpha = clamp((eco - 1.55) * 2, 0, 1);
      for (let i = 0; i < animals.length; i++) {
        const a = animals[i], time = sim.clock * .15 + a.offset;
        const x = (a.x + Math.sin(time) * .7) * tile, y = (a.y + Math.cos(time * .8) * .6) * tile;
        if (!sim.isLand(Math.floor(x / tile), Math.floor(y / tile)) || waterAt(Math.floor(x / tile), Math.floor(y / tile))) continue;
        drawSprite(ctx, i % 3 ? 'rabbit' : 'mouse', x, y + Math.sin(time * 5) * 1.5, 1.7, alpha);
      }
    }
    if (eco > .8) for (let i = 0; i < Math.min(6, Math.ceil(eco * 2)); i++) {
      const time = sim.clock * 20 + i * 270;
      const x = (time % (worldW + 180)) - 90, y = 160 + Math.sin(time / 190 + i) * 130 + i * 65;
      ctx.fillStyle = '#354b38'; ctx.globalAlpha = clamp((eco - .8) * 2, 0, .75);
      const flap = Math.sin(sim.clock * 5 + i) > 0 ? -3 : 1;
      ctx.fillRect(x, y, 3, 2); ctx.fillRect(x - 4, y + flap, 4, 2); ctx.fillRect(x + 3, y + flap, 4, 2); ctx.globalAlpha = 1;
    }
  }
  function drawMap(time, dt) {
    camera.actualZoom += (camera.zoom - camera.actualZoom) * (reducedMotion ? 1 : Math.min(1, dt * 3)); scale = fit * camera.actualZoom;
    ctx.fillStyle = '#3d777f'; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale); ctx.translate(-camera.x, -camera.y);
    ctx.drawImage(terrain, 0, 0);
    for (const tree of sim.cells) if (tree) {
      const x = tree.x * tile + tile / 2, y = tree.y * tile + tile / 2 + 5;
      ctx.fillStyle = '#4c502723'; ctx.fillRect(x - 8, y - 1, 19, 5);
      if (tree.state === 'dead') drawSprite(ctx, 'dead', x, y, 2, clamp(1 - (sim.clock - tree.deadAt) / 7, .2, 1));
      else if (tree.state === 'seed') {
        drawSprite(ctx, 'seed', x, y, 1.8);
        ctx.fillStyle = '#f3df9a99'; ctx.fillRect(x - 8, y + 5, 16 * clamp((sim.clock - tree.born) / (tree.settleAt - tree.born), 0, 1), 2);
      } else {
        const size = 1.35 + clamp((sim.clock - tree.settleAt) / 7, 0, 1) * .7;
        const sway = reducedMotion ? 0 : Math.round(Math.sin(sim.clock * 2 + tree.variant * 10) * sim.wind);
        drawSprite(ctx, tree.species, x + sway, y, size);
      }
    }
    drawAnimals();
    if (moveTarget) {
      const x = moveTarget.x * tile, y = moveTarget.y * tile;
      ctx.strokeStyle = '#f6f5d5'; ctx.lineWidth = 1.5 / scale;
      ctx.strokeRect(x - 5, y - 5, 10, 10);
    }
    const px = player.x * tile, py = player.y * tile;
    const playerSize = Math.max(2.5, 2 / scale);
    const walkingBob = player.walking && !reducedMotion ? Math.sin(player.stride * 9) * 1.4 : 0;
    ctx.fillStyle = '#2c483945'; ctx.fillRect(px - 11, py - 2, 22, 6);
    drawSprite(ctx, 'gardener', px, py + 5 + walkingBob, playerSize);
    if (player.walking) {
      ctx.fillStyle = '#d5bc87'; ctx.globalAlpha = .22;
      ctx.fillRect(px - player.facing.x * 16 - 3, py - player.facing.y * 16, 5, 3); ctx.globalAlpha = 1;
    }
    if (time < plantingUntil) {
      ctx.strokeStyle = '#775b3a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px + 9, py - 8); ctx.lineTo(px + 17 + player.facing.x * 6, py + 6); ctx.stroke();
      ctx.fillStyle = '#c6ccab'; ctx.fillRect(px + 14 + player.facing.x * 6, py + 4, 7, 4);
    }
    ctx.font = `${12 / scale}px "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center';
    ctx.fillStyle = '#fff3ce'; ctx.fillText('你', px, py - bitmap.gardener.height * playerSize - 5 / scale);
    ctx.fillStyle = '#f4e8ba'; ctx.fillRect(px + player.facing.x * 14 - 2, py + player.facing.y * 14 - 2, 4, 4);
    ctx.restore();
    if (!reducedMotion) {
      const count = Math.round(125 * clamp(1 - eco / 3, 0, 1));
      ctx.strokeStyle = '#e3c99b';
      for (let i = 0; i < count; i++) {
        const p = particles[i], x = (p.x * width + time * .001 * p.speed) % (width + 90) - 45;
        const y = (p.y * height + time * .001 * 7) % height;
        ctx.globalAlpha = .16 + (i % 4) * .045; ctx.lineWidth = 1.6 + i % 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 28 + sim.wind * 38, y + 6); ctx.stroke();
        if (i % 3 === 0) { const size = 3 + i % 5; ctx.fillStyle = '#e8c993'; ctx.fillRect(x + 18, y - 2, size * 1.6, size); }
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = `rgba(223,185,115,${clamp((1 - eco / 2.5) * .08, 0, .08)})`; ctx.fillRect(0, 0, width, height);
  }
  function frame(time) {
    const dt = Math.min((time - lastFrame) / 1000, .08); lastFrame = time;
    sim.step(dt * speed); eco += (sim.phase - eco) * Math.min(1, dt * .55);
    const has = key => keys.has(key) || touchKeys.has(key);
    let dx = Number(has('d') || has('arrowright')) - Number(has('a') || has('arrowleft'));
    let dy = Number(has('s') || has('arrowdown')) - Number(has('w') || has('arrowup'));
    let walkDt = dt;
    if (!dx && !dy && moveTarget) {
      const tx = moveTarget.x - player.x, ty = moveTarget.y - player.y;
      if (Math.hypot(tx, ty) < .12) moveTarget = null;
      else { dx = tx; dy = ty; walkDt = Math.min(dt, Math.hypot(tx, ty) / 4.6); }
    }
    const moved = player.walk(dx, dy, walkDt);
    if (moveTarget && (dx || dy) && !moved) moveTarget = null;
    if (moved && camera.zoom > 1.5) {
      const maxX = Math.max(tile, width / scale / 2 - tile * 3), maxY = Math.max(tile, height / scale / 2 - tile * 3);
      if (Math.abs(player.x * tile - camera.x) > maxX) camera.x += (player.x * tile - camera.x) * dt * 2;
      if (Math.abs(player.y * tile - camera.y) > maxY) camera.y += (player.y * tile - camera.y) * dt * 2;
    }
    if ((plantHeld || [...plantingKeys].some(key => keys.has(key))) && time - lastPlant > 145) plantNearPlayer(false);
    for (const event of sim.drainEvents()) {
      if (event.type === 'phase') { unlocked.add(event.phase); updateJournal(); showNote(event.phase); }
      else if (event.type === 'ending') beginEnding();
    }
    if (sim.dead > 0 && !toastDeathShown) { toastDeathShown = true; showToast('有树苗没能扎根。枯枝旁可以再种一棵。'); }
    if (time - lastTerrain > 350) { rebuildTerrain(); lastTerrain = time; }
    if (time - lastUi > 150) { updateUi(); lastUi = time; }
    drawMap(time, dt); requestAnimationFrame(frame);
  }
  rebuildTerrain(); updateUi(); updateJournal(); showNote(0); requestAnimationFrame(frame);
})();
