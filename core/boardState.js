/**
 * core/boardState.js
 *
 * Saf board modeli. DOM, canvas, render koordinatı yok.
 * Node.js'te ve tarayıcıda aynı şekilde çalışır.
 *
 * Tasarım prensibi: immutable operasyonlar yeni BoardState döndürür.
 * Renderer bu nesneyi okur, asla doğrudan mutate etmez.
 */

export class BoardState {
  /**
   * @param {number} size  — 9 | 13 | 19
   */
  constructor(size = 9) {
    this.size = size;
    /** @type {(null|'black'|'white')[][]}  [row][col] */
    this.grid = Array.from({ length: size }, () => Array(size).fill(null));
    /** @type {'black'|'white'} */
    this.turn = 'black';
    /** @type {{x:number,y:number}|null} */
    this.koPoint = null;
    /** @type {{x:number,y:number,color:'black'|'white'}[]} */
    this.stones = [];  // flat list — renderer için hızlı erişim
  }

  // ── Temel sorgular ────────────────────────────────────────

  isInBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  isOccupied(x, y) {
    return this.isInBounds(x, y) && this.grid[y][x] !== null;
  }

  isEmpty(x, y) {
    return this.isInBounds(x, y) && this.grid[y][x] === null;
  }

  colorAt(x, y) {
    return this.isInBounds(x, y) ? this.grid[y][x] : null;
  }

  // ── Mutasyonlar (mevcut state'i değiştirir, yeni state döndürmez) ─
  // NOT: Faz 2'de immutable clone yöntemi eklenecek.
  // Şu an adapter kolaylığı için in-place mutasyon kullanıyoruz.

  /**
   * Taş yerleştir. Geçerlilik kontrolü yapmaz (ruleEngine sorumluluğu).
   */
  placeStone(x, y, color) {
    if (!this.isInBounds(x, y)) return;
    if (this.grid[y][x] !== null) return;
    this.grid[y][x] = color;
    this.stones.push({ x, y, color });
  }

  /**
   * Taşı kaldır (yakalama veya reset).
   */
  removeStone(x, y) {
    if (!this.isInBounds(x, y)) return;
    this.grid[y][x] = null;
    const idx = this.stones.findIndex(s => s.x === x && s.y === y);
    if (idx !== -1) this.stones.splice(idx, 1);
  }

  /**
   * Board'u temizle.
   */
  reset(size = this.size) {
    this.size = size;
    this.grid = Array.from({ length: size }, () => Array(size).fill(null));
    this.turn = 'black';
    this.koPoint = null;
    this.stones = [];
  }

  /**
   * Derin kopya — yeni BoardState döndürür.
   */
  clone() {
    const b = new BoardState(this.size);
    b.grid = this.grid.map(row => [...row]);
    b.turn = this.turn;
    b.koPoint = this.koPoint ? { ...this.koPoint } : null;
    b.stones = this.stones.map(s => ({ ...s }));
    return b;
  }

  /**
   * Komşu hücreleri döndür (board sınırları içinde).
   * @returns {{x:number,y:number}[]}
   */
  neighbors(x, y) {
    return [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ].filter(n => this.isInBounds(n.x, n.y));
  }
}
