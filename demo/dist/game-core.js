(function (root) {
  'use strict';
  const SPECIES = {
    saxaul: { name: '梭梭', base: .90, vulnerability: .30, shelter: .65, soil: .65, loss: .025 },
    willow: { name: '沙柳', base: .84, vulnerability: .43, shelter: 1.85, soil: .85, loss: .04 },
    flower: { name: '花棒', base: .81, vulnerability: .51, shelter: .9, soil: 1.85, loss: .045 }
  };
  const THRESHOLDS = [0, 12, 36, 80];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function islandDepth(x, y) {
    const nx = (x + .5 - 26) / 22, ny = (y + .5 - 18) / 14;
    const angle = Math.atan2(ny, nx);
    return 1 + .075 * Math.sin(angle * 3) + .04 * Math.cos(angle * 7) - .035 * Math.sin(angle * 5) - Math.hypot(nx, ny);
  }
  class Simulation {
    constructor(random = Math.random) {
      this.random = random; this.cols = 52; this.rows = 36; this.clock = 0;
      this.cells = new Array(this.cols * this.rows).fill(null);
      this.live = 0; this.seedlings = 0; this.dead = 0; this.planted = 0;
      this.wind = .98; this.soil = 0; this.phase = 0; this.highestPhase = 0;
      this.events = []; this.ended = false;
    }
    get(x, y) { return this.cells[y * this.cols + x]; }
    isLand(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows && islandDepth(x, y) > 0; }
    plant(x, y, species) {
      if (!SPECIES[species] || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
      if (!this.isLand(x, y)) return false;
      const index = y * this.cols + x;
      if (this.cells[index] && this.cells[index].state !== 'dead') return false;
      this.cells[index] = { x, y, species, state: 'seed', born: this.clock, settleAt: this.clock + 2.4 + this.random() * 1.2, nextCheck: Infinity, variant: this.random() };
      this.planted++; this.seedlings++; return true;
    }
    shelterAt(x, y) {
      let total = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx >= this.cols || y + dy >= this.rows) continue;
        const tree = this.get(x + dx, y + dy), d = Math.hypot(dx, dy);
        if (tree && tree.state === 'live' && d <= 3.5) total += SPECIES[tree.species].shelter / (1 + d);
      }
      return Math.min(.17, total * .028);
    }
    survival(species, x, y) {
      const s = SPECIES[species];
      return clamp(s.base - this.wind * s.vulnerability + this.soil * .08 + (x === undefined ? 0 : this.shelterAt(x, y)), .12, .97);
    }
    die(tree) {
      if (tree.state === 'live') this.live--; else this.seedlings--;
      tree.state = 'dead'; tree.deadAt = this.clock; this.dead++;
    }
    step(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      this.clock += dt;
      for (let i = 0; i < this.cells.length; i++) {
        const t = this.cells[i]; if (!t) continue;
        if (t.state === 'seed' && this.clock >= t.settleAt) {
          if (this.random() < this.survival(t.species, t.x, t.y)) {
            t.state = 'live'; this.seedlings--; this.live++;
            t.nextCheck = this.clock + 14 + this.random() * 8;
          } else this.die(t);
        } else if (t.state === 'live' && this.clock >= t.nextCheck) {
          const loss = .008 + this.wind * SPECIES[t.species].loss;
          if (this.random() < loss) this.die(t);
          else t.nextCheck = this.clock + 14 + this.random() * 8;
        } else if (t.state === 'dead' && this.clock - t.deadAt > 5) this.cells[i] = null;
      }
      let protection = 0, soil = 0;
      for (const t of this.cells) if (t && t.state === 'live') { protection += SPECIES[t.species].shelter; soil += SPECIES[t.species].soil; }
      this.wind = Math.max(.08, .98 - .9 * (1 - Math.exp(-protection / 37)));
      this.soil = Math.min(1, soil / 95);
      this.phase = this.live >= 80 ? 3 : this.live >= 36 ? 2 : this.live >= 12 ? 1 : 0;
      while (this.highestPhase < this.phase) {
        this.highestPhase++; this.events.push({ type: 'phase', phase: this.highestPhase });
      }
      if (this.phase === 3 && !this.ended) { this.ended = true; this.events.push({ type: 'ending' }); }
    }
    drainEvents() { const events = this.events; this.events = []; return events; }
  }
  class Gardener {
    constructor(sim) {
      this.sim = sim; this.x = 26.5; this.y = 18.5;
      this.facing = { x: 0, y: 1 }; this.walking = false; this.stride = 0;
    }
    canStand(x, y) {
      return [-.18, .18].every(dx => [-.18, .18].every(dy => this.sim.isLand(Math.floor(x + dx), Math.floor(y + dy))));
    }
    walk(dx, dy, dt) {
      const length = Math.hypot(dx, dy); this.walking = false;
      if (!length || !Number.isFinite(dt) || dt <= 0) return false;
      this.facing = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
      const mx = dx / length * dt * 4.6, my = dy / length * dt * 4.6;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(my)) / .15));
      const startX = this.x, startY = this.y;
      for (let i = 0; i < steps; i++) {
        if (this.canStand(this.x + mx / steps, this.y)) this.x += mx / steps;
        if (this.canStand(this.x, this.y + my / steps)) this.y += my / steps;
      }
      const distance = Math.hypot(this.x - startX, this.y - startY);
      this.walking = distance > .001; this.stride += distance;
      return this.walking;
    }
    plant(species, blocked = () => false) {
      const candidates = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = Math.floor(this.x) + dx, y = Math.floor(this.y) + dy;
        const rx = x + .5 - this.x, ry = y + .5 - this.y, distance = Math.hypot(rx, ry);
        if (distance >= .7 && distance <= 1.8) candidates.push({ x, y, score: (rx * this.facing.x + ry * this.facing.y) * 2 - distance });
      }
      candidates.sort((a, b) => b.score - a.score);
      for (const cell of candidates) if (!blocked(cell.x, cell.y) && this.sim.plant(cell.x, cell.y, species)) return { x: cell.x, y: cell.y };
      return null;
    }
  }
  const api = { Simulation, Gardener, SPECIES, THRESHOLDS, clamp, islandDepth };
  root.GroveCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
