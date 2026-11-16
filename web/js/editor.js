import { instantiateTemplate } from "./templates.js";

export const DOC_PRESETS = {
  a4: { title: "Обложка A4", width: 2480, height: 3508 },
  letter: { title: "Обложка Letter", width: 2550, height: 3300 },
  square: { title: "Квадрат", width: 3000, height: 3000 },
  "a4-150": { title: "Обложка A4 · 150 dpi", width: 1240, height: 1754 },
  "instagram-post": { title: "Instagram · пост", width: 1080, height: 1350 },
  "instagram-square": { title: "Instagram · квадрат", width: 1080, height: 1080 },
  "instagram-story": { title: "Instagram · сторис", width: 1080, height: 1920 },
};

const TEXT_FONT = "'Arial Black', Arial, sans-serif";

export const IMAGE_FILTERS = {
  brightness: { label: "Яркость", min: 0, max: 200, default: 100, unit: "%" },
  contrast: { label: "Контраст", min: 0, max: 200, default: 100, unit: "%" },
  saturate: { label: "Насыщенность", min: 0, max: 200, default: 100, unit: "%" },
  blur: { label: "Размытие", min: 0, max: 40, default: 0, unit: "px" },
  grayscale: { label: "Ч/б", min: 0, max: 100, default: 0, unit: "%" },
  sepia: { label: "Сепия", min: 0, max: 100, default: 0, unit: "%" },
};

export const BLEND_MODES = [
  ["source-over", "Обычный"],
  ["multiply", "Умножение"],
  ["screen", "Экран"],
  ["overlay", "Перекрытие"],
  ["soft-light", "Мягкий свет"],
  ["luminosity", "Яркость"],
];

function filterString(layer) {
  const f = layer.filters || {};
  const parts = [];
  const b = f.brightness ?? 100;
  const c = f.contrast ?? 100;
  const s = f.saturate ?? 100;
  const blur = f.blur ?? 0;
  const gray = f.grayscale ?? 0;
  const sepia = f.sepia ?? 0;
  if (b !== 100) parts.push(`brightness(${b}%)`);
  if (c !== 100) parts.push(`contrast(${c}%)`);
  if (s !== 100) parts.push(`saturate(${s}%)`);
  if (blur > 0) parts.push(`blur(${blur}px)`);
  if (gray > 0) parts.push(`grayscale(${gray}%)`);
  if (sepia > 0) parts.push(`sepia(${sepia}%)`);
  return parts.length ? parts.join(" ") : "none";
}

let idCounter = 0;

function makeId(prefix = "layer") {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function escapeForCss(value) {
  return String(value).replace(/["\\]/g, "");
}

export class CoverEditor {
  constructor({ canvas, wrap, inlineInput, callbacks = {} }) {
    this.canvas = canvas;
    this.wrap = wrap;
    this.inlineInput = inlineInput;
    this.ctx = canvas.getContext("2d");
    this.callbacks = callbacks;
    this.doc = { width: 2480, height: 3508, background: "#ffffff" };
    this.layers = [];
    this.photoSlot = null;
    this.templateId = null;
    this.gridMode = "none";
    this.snapEnabled = true;
    this.selectedId = null;
    this.scale = 0.1;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.drag = null;
    this.guides = null;
    this.editingId = null;
    this._editBackup = null;
    this._inlineTimer = null;
    this._imageCache = new Map();
    this.history = [];
    this.future = [];
    this._bindEvents();
    this._bindInlineInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(wrap);
    this.resize();
  }

  _bindEvents() {
    this.canvas.addEventListener("pointerdown", (event) => this._onPointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this._onPointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this._onPointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this._onPointerUp(event));
    this.canvas.addEventListener("dblclick", (event) => this._onDoubleClick(event));
    this.canvas.addEventListener("pointerleave", () => {
      if (!this.drag) this.canvas.style.cursor = "default";
    });
  }

  _bindInlineInput() {
    this.inlineInput.addEventListener("input", () => {
      const layer = this.getSelected();
      if (!layer || this.editingId !== layer.id) return;
      layer.text = this.inlineInput.value;
      this._render();
      this._positionInlineEditor(layer);
    });
    this.inlineInput.addEventListener("blur", () => this.commitInlineEdit());
    this.inlineInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.cancelInlineEdit();
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.commitInlineEdit();
      }
    });
  }

  _notifySelection() {
    this.callbacks.onSelectionChange?.(this.getSelected());
  }

  _notifyLayers() {
    this.callbacks.onLayersChange?.(this.layers);
  }

  _notifyLayer(layer) {
    this.callbacks.onLayerUpdate?.(layer);
  }

  _notifyDoc() {
    this.callbacks.onDocChange?.(this.doc);
  }

  _notifyHistory() {
    this.callbacks.onHistoryChange?.({
      canUndo: this.history.length > 0,
      canRedo: this.future.length > 0,
    });
  }

  resize() {
    const style = getComputedStyle(this.wrap);
    const availWidth = Math.max(80, this.wrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const availHeight = Math.max(80, this.wrap.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
    this.scale = Math.min(availWidth / this.doc.width, availHeight / this.doc.height);
    this.scale = Math.max(0.01, this.scale);
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssWidth = Math.max(40, Math.round(this.doc.width * this.scale));
    const cssHeight = Math.max(40, Math.round(this.doc.height * this.scale));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.width = Math.max(1, Math.round(cssWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * this.dpr));
    this.callbacks.onViewChange?.({ scale: this.scale, cssWidth, cssHeight });
    this._render();
  }

  _render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    ctx.fillStyle = this.doc.background;
    ctx.fillRect(0, 0, this.doc.width, this.doc.height);
    for (const layer of this.layers) {
      if (!layer.visible || layer.overlay) continue;
      if (layer.id === this.editingId) continue;
      if (layer.type === "text") this._layoutText(layer);
      this._drawLayer(ctx, layer);
    }
    for (const layer of this.layers) {
      if (!layer.visible || !layer.overlay) continue;
      this._drawLayer(ctx, layer);
    }
    const selected = this.getSelected();
    if (selected && selected.visible && selected.id !== this.editingId) {
      if (selected.type === "text") this._layoutText(selected);
      this._drawSelection(ctx, selected);
    }
    this._drawPhotoSlot(ctx);
    this._drawGrid(ctx);
    if (this.guides) this._drawGuides(ctx);
  }

  setGridMode(mode) {
    this.gridMode = mode || "none";
    this._render();
  }

  _drawGrid(ctx) {
    const mode = this.gridMode;
    if (!mode || mode === "none") return;
    const w = this.doc.width;
    const h = this.doc.height;
    ctx.save();
    ctx.strokeStyle = "rgba(110, 165, 255, 0.42)";
    ctx.lineWidth = 1 / this.scale;
    ctx.setLineDash([8 / this.scale, 8 / this.scale]);
    if (mode === "margins") {
      const mx = w * 0.05;
      const my = h * 0.05;
      ctx.strokeRect(mx, my, w - mx * 2, h - my * 2);
    } else {
      const columns = mode === "six" ? 6 : 3;
      const rows = mode === "six" ? 4 : 3;
      for (let index = 1; index < columns; index += 1) {
        const x = (w * index) / columns;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let index = 1; index < rows; index += 1) {
        const y = (h * index) / rows;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Пунктирная подсказка, куда поместить фото. Не попадает в экспорт.
  _drawPhotoSlot(ctx) {
    const slot = this.photoSlot;
    if (!slot) return;
    const hasPhoto = this.layers.some((layer) => layer.type === "image" && layer.inSlot);
    if (hasPhoto) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 90, 54, 0.65)";
    ctx.lineWidth = 3 / this.scale;
    ctx.setLineDash([18 / this.scale, 12 / this.scale]);
    roundRectPath(ctx, slot.x, slot.y, slot.width, slot.height, 12 / this.scale);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = "ПЕРЕТАЩИТЕ ФОТО СЮДА";
    ctx.font = `600 ${Math.max(24, Math.min(64, slot.width * 0.035))}px Montserrat, Arial, sans-serif`;
    ctx.fillStyle = "rgba(255, 90, 54, 0.75)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, slot.x + slot.width / 2, slot.y + slot.height / 2);
    ctx.restore();
  }

  _fontString(layer) {
    return `${layer.italic ? "italic " : ""}${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
  }

  _layoutText(layer) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = this._fontString(layer);
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${layer.letterSpacing || 0}px`;
    const pad = layer.backgroundEnabled ? layer.backgroundPadding || 0 : 0;
    const innerWidth = Math.max(20, layer.width - pad * 2);
    const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
    const sourceLines = text.split("\n");
    const lines = [];
    for (const paragraph of sourceLines) {
      if (!paragraph) {
        lines.push("");
        continue;
      }
      const tokens = paragraph.split(/(\s+)/).filter((token) => token.length);
      let line = "";
      for (const token of tokens) {
        const candidate = line + token;
        if (ctx.measureText(candidate.trimEnd()).width > innerWidth && line.trim()) {
          lines.push(line.trimEnd());
          line = token.trimStart();
        } else {
          line = candidate;
        }
      }
      lines.push(line.trimEnd());
    }
    const lineHeightPx = layer.fontSize * layer.lineHeight;
    layer.height = Math.max(layer.fontSize, lines.length * lineHeightPx + pad * 2);
    layer._layout = { lines, pad, lineHeightPx, innerWidth };
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.restore();
  }

  _drawLayer(ctx, layer) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));
    const filter = filterString(layer);
    if (filter !== "none" && "filter" in ctx) ctx.filter = filter;
    if (layer.blendMode && layer.blendMode !== "source-over") {
      ctx.globalCompositeOperation = layer.blendMode;
    }
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
    if (layer.flipX) ctx.scale(-1, 1);
    if (layer.type === "image") {
      this._drawImageLayer(ctx, layer);
    } else if (layer.type === "shape") {
      this._drawShape(ctx, layer);
    } else {
      this._drawText(ctx, layer);
    }
    ctx.restore();
  }

  _drawImageLayer(ctx, layer) {
    const img = layer._img;
    const x = -layer.width / 2;
    const y = -layer.height / 2;
    if (!(img && img.complete && img.naturalWidth)) {
      ctx.fillStyle = "#2a2a30";
      ctx.fillRect(x, y, layer.width, layer.height);
      return;
    }
    const crop = layer.crop;
    if (crop && crop.width > 0 && crop.height > 0) {
      ctx.drawImage(
        img,
        crop.x * img.naturalWidth,
        crop.y * img.naturalHeight,
        crop.width * img.naturalWidth,
        crop.height * img.naturalHeight,
        x, y, layer.width, layer.height,
      );
    } else {
      ctx.drawImage(img, x, y, layer.width, layer.height);
    }
  }

  _drawShape(ctx, layer) {
    const w = layer.width;
    const h = layer.height;
    const shape = layer.shape || "rect";
    const x = -w / 2;
    const y = -h / 2;
    ctx.beginPath();
    if (shape === "ellipse") {
      ctx.ellipse(0, 0, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
    } else if (shape === "line") {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + w, 0);
    } else {
      roundRectPath(ctx, x, y, w, h, layer.radius || 0);
    }
    if (layer.fill || layer.gradient) {
      if (layer.gradient && shape !== "line") {
        const angle = ((layer.gradient.angle || 0) * Math.PI) / 180;
        const dx = (Math.cos(angle) * w) / 2;
        const dy = (Math.sin(angle) * h) / 2;
        const gradient = ctx.createLinearGradient(-dx, -dy, dx, dy);
        gradient.addColorStop(0, layer.gradient.from || "#ffffff");
        gradient.addColorStop(1, layer.gradient.to || "#000000");
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = layer.fill || "#ffffff";
      }
      ctx.fill();
    }
    if (layer.stroke && layer.strokeWidth > 0) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.strokeWidth;
      ctx.stroke();
    }
    if (!layer.label || shape === "line") return;
    ctx.save();
    ctx.font = `${layer.fontWeight || 800} ${layer.fontSize || 48}px ${layer.fontFamily || "Montserrat, Arial, sans-serif"}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${layer.letterSpacing || 0}px`;
    ctx.fillStyle = layer.labelColor || "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labelText = layer.uppercase ? String(layer.label).toUpperCase() : String(layer.label);
    const lines = labelText.split("\n");
    const lineHeight = (layer.fontSize || 48) * 1.08;
    const startY = -((lines.length - 1) * lineHeight) / 2;
    for (let index = 0; index < lines.length; index += 1) {
      ctx.fillText(lines[index], 0, startY + index * lineHeight);
    }
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.restore();
  }

  _drawText(ctx, layer) {
    const { lines, pad, lineHeightPx } = layer._layout;
    const w = layer.width;
    const h = layer.height;
    ctx.font = this._fontString(layer);
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${layer.letterSpacing || 0}px`;
    ctx.textBaseline = "top";
    if (layer.backgroundEnabled) {
      const radius = layer.plateRadius ?? Math.min(18, layer.fontSize * 0.15);
      roundRectPath(ctx, -w / 2, -h / 2, w, h, radius);
      ctx.fillStyle = layer.backgroundColor || "#ffffff";
      ctx.fill();
      if (layer.plateStrokeColor && layer.plateStrokeWidth > 0) {
        ctx.strokeStyle = layer.plateStrokeColor;
        ctx.lineWidth = layer.plateStrokeWidth;
        ctx.stroke();
      }
    }
    const align = layer.align || "center";
    ctx.textAlign = align;
    const x = align === "left" ? -w / 2 + pad : align === "right" ? w / 2 - pad : 0;
    for (let index = 0; index < lines.length; index += 1) {
      const y = -h / 2 + pad + index * lineHeightPx;
      if (layer.shadowEnabled && layer.shadowBlur > 0) {
        ctx.shadowColor = layer.shadowColor || "rgba(0,0,0,.55)";
        ctx.shadowBlur = layer.shadowBlur;
        ctx.shadowOffsetX = layer.shadowOffsetX || 0;
        ctx.shadowOffsetY = layer.shadowOffsetY ?? Math.max(2, layer.fontSize * 0.035);
      } else {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
      if (layer.strokeWidth > 0) {
        ctx.strokeStyle = layer.strokeColor || "#000000";
        ctx.lineWidth = layer.strokeWidth;
        ctx.lineJoin = "round";
        ctx.strokeText(lines[index], x, y);
      }
      ctx.fillStyle = layer.color || "#ffffff";
      ctx.fillText(lines[index], x, y);
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  _drawSelection(ctx, layer) {
    const w = layer.width;
    const h = layer.height;
    const handle = 5.5 / this.scale;
    const rotateOffset = 30 / this.scale;
    ctx.save();
    ctx.translate(layer.x + w / 2, layer.y + h / 2);
    ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
    ctx.strokeStyle = "#ff5a36";
    ctx.lineWidth = 1.4 / this.scale;
    ctx.setLineDash([7 / this.scale, 5 / this.scale]);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, -h / 2 - rotateOffset);
    ctx.stroke();
    ctx.fillStyle = "#ff5a36";
    ctx.beginPath();
    ctx.arc(0, -h / 2 - rotateOffset, handle + 1 / this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, -h / 2 - rotateOffset, handle - 1.5 / this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#ff5a36";
    ctx.lineWidth = 1.6 / this.scale;
    for (const [hx, hy] of [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ]) {
      ctx.beginPath();
      ctx.rect(hx - handle / 2, hy - handle / 2, handle, handle);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawGuides(ctx) {
    if (!this.guides) return;
    const xs = Array.isArray(this.guides.xs) ? this.guides.xs : [this.guides.x];
    const ys = Array.isArray(this.guides.ys) ? this.guides.ys : [this.guides.y];
    ctx.save();
    ctx.strokeStyle = "#ff5a36";
    ctx.lineWidth = 1 / this.scale;
    ctx.setLineDash([9 / this.scale, 7 / this.scale]);
    for (const x of xs) {
      if (x === null || x === undefined) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.doc.height);
      ctx.stroke();
    }
    for (const y of ys) {
      if (y === null || y === undefined) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.doc.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.doc.width,
      y: ((event.clientY - rect.top) / rect.height) * this.doc.height,
    };
  }

  _localPoint(layer, point) {
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const angle = (-(layer.rotation || 0) * Math.PI) / 180;
    return {
      x: dx * Math.cos(angle) - dy * Math.sin(angle),
      y: dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  }

  _handleAt(layer, point) {
    const local = this._localPoint(layer, point);
    const w = layer.width;
    const h = layer.height;
    const tolerance = 13 / this.scale;
    if (Math.abs(local.x) < tolerance && Math.abs(local.y - (-h / 2 - 30 / this.scale)) < tolerance) {
      return "rotate";
    }
    const corners = {
      nw: [-w / 2, -h / 2],
      ne: [w / 2, -h / 2],
      se: [w / 2, h / 2],
      sw: [-w / 2, h / 2],
    };
    for (const [name, [hx, hy]] of Object.entries(corners)) {
      if (Math.abs(local.x - hx) < tolerance && Math.abs(local.y - hy) < tolerance) return name;
    }
    return null;
  }

  _layerAt(point) {
    for (let index = this.layers.length - 1; index >= 0; index -= 1) {
      const layer = this.layers[index];
      if (!layer.visible) continue;
      const local = this._localPoint(layer, point);
      if (Math.abs(local.x) <= layer.width / 2 && Math.abs(local.y) <= layer.height / 2) return layer;
    }
    return null;
  }

  _onPointerDown(event) {
    if (event.button !== 0) return;
    if (this.editingId) this.commitInlineEdit();
    this.canvas.focus();
    const point = this._point(event);
    const selected = this.getSelected();
    if (selected) {
      const handle = this._handleAt(selected, point);
      if (handle) {
        event.preventDefault();
        this.pushHistory();
        this.drag = {
          mode: handle === "rotate" ? "rotate" : "resize",
          handle,
          layerId: selected.id,
          start: point,
          startLayer: {
            x: selected.x,
            y: selected.y,
            width: selected.width,
            height: selected.height,
            rotation: selected.rotation || 0,
            fontSize: selected.fontSize || 0,
            radius: selected.radius || 0,
            strokeWidth: selected.strokeWidth || 0,
          },
          moved: true,
        };
        if (handle === "rotate") {
          const cx = selected.x + selected.width / 2;
          const cy = selected.y + selected.height / 2;
          this.drag.startAngle = Math.atan2(point.y - cy, point.x - cx);
        }
        this.canvas.setPointerCapture(event.pointerId);
        return;
      }
    }
    const hit = this._layerAt(point);
    if (!hit) {
      this.select(null);
      return;
    }
    if (hit.id !== this.selectedId) this.select(hit.id);
    if (hit.locked) return;
    this.drag = {
      mode: "move",
      layerId: hit.id,
      start: point,
      startLayer: { x: hit.x, y: hit.y, width: hit.width, height: hit.height },
      moved: false,
      historyPushed: false,
    };
    this.canvas.setPointerCapture(event.pointerId);
  }

  _onPointerMove(event) {
    const point = this._point(event);
    if (!this.drag) {
      const selected = this.getSelected();
      let cursor = "default";
      if (selected) {
        const handle = this._handleAt(selected, point);
        if (handle === "rotate") cursor = "grab";
        else if (handle) cursor = handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize";
      }
      if (cursor === "default" && this._layerAt(point)) cursor = "move";
      this.canvas.style.cursor = cursor;
      return;
    }
    const layer = this.layers.find((item) => item.id === this.drag.layerId);
    if (!layer) return;
    if (this.drag.mode === "move") {
      const dx = point.x - this.drag.start.x;
      const dy = point.y - this.drag.start.y;
      if (!this.drag.moved && Math.hypot(dx, dy) * this.scale < 2) return;
      if (!this.drag.historyPushed) {
        this.pushHistory();
        this.drag.historyPushed = true;
      }
      this.drag.moved = true;
      let newX = this.drag.startLayer.x + dx;
      let newY = this.drag.startLayer.y + dy;
      const snap = 8 / this.scale;
      const guideXs = [];
      const guideYs = [];
      if (this.snapEnabled) {
        const targetsX = [this.doc.width / 2];
        const targetsY = [this.doc.height / 2];
        for (const other of this.layers) {
          if (other === layer || !other.visible) continue;
          targetsX.push(other.x, other.x + other.width / 2, other.x + other.width);
          targetsY.push(other.y, other.y + other.height / 2, other.y + other.height);
        }
        const edgesX = [newX, newX + layer.width / 2, newX + layer.width];
        const edgesY = [newY, newY + layer.height / 2, newY + layer.height];
        let bestX = null;
        let bestY = null;
        for (const edge of edgesX) {
          for (const target of targetsX) {
            const distance = Math.abs(edge - target);
            if (distance < snap && (!bestX || distance < bestX.distance)) {
              bestX = { distance, edge, target };
            }
          }
        }
        for (const edge of edgesY) {
          for (const target of targetsY) {
            const distance = Math.abs(edge - target);
            if (distance < snap && (!bestY || distance < bestY.distance)) {
              bestY = { distance, edge, target };
            }
          }
        }
        if (bestX) {
          newX += bestX.target - bestX.edge;
          guideXs.push(bestX.target);
        }
        if (bestY) {
          newY += bestY.target - bestY.edge;
          guideYs.push(bestY.target);
        }
      }
      layer.x = newX;
      layer.y = newY;
      this.guides = { xs: guideXs, ys: guideYs };
      this._render();
      this._notifyLayer(layer);
    } else if (this.drag.mode === "resize") {
      this._resizeLayer(layer, point);
    } else if (this.drag.mode === "rotate") {
      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;
      const angle = Math.atan2(point.y - cy, point.x - cx);
      let rotation = this.drag.startLayer.rotation + ((angle - this.drag.startAngle) * 180) / Math.PI;
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      rotation = ((rotation + 180) % 360 + 360) % 360 - 180;
      layer.rotation = Math.round(rotation * 10) / 10;
      this._render();
      this._notifyLayer(layer);
    }
  }

  _resizeLayer(layer, point) {
    const start = this.drag.startLayer;
    const handle = this.drag.handle;
    const signX = handle.includes("w") ? -1 : 1;
    const signY = handle.includes("n") ? -1 : 1;
    const center = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    const angle = ((start.rotation || 0) * Math.PI) / 180;
    const anchorLocal = { x: (-signX * start.width) / 2, y: (-signY * start.height) / 2 };
    const anchor = {
      x: center.x + anchorLocal.x * Math.cos(angle) - anchorLocal.y * Math.sin(angle),
      y: center.y + anchorLocal.x * Math.sin(angle) + anchorLocal.y * Math.cos(angle),
    };
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    const local = {
      x: dx * Math.cos(-angle) - dy * Math.sin(-angle),
      y: dx * Math.sin(-angle) + dy * Math.cos(-angle),
    };
    const diagX = signX * start.width;
    const diagY = signY * start.height;
    let factor = (local.x * diagX + local.y * diagY) / (diagX * diagX + diagY * diagY);
    factor = Math.max(0.03, factor);
    const newWidth = Math.max(24, start.width * factor);
    const newHeight = Math.max(16, start.height * factor);
    const newCenter = {
      x: anchor.x + (signX * newWidth / 2) * Math.cos(angle) - (signY * newHeight / 2) * Math.sin(angle),
      y: anchor.y + (signX * newWidth / 2) * Math.sin(angle) + (signY * newHeight / 2) * Math.cos(angle),
    };
    layer.x = newCenter.x - newWidth / 2;
    layer.y = newCenter.y - newHeight / 2;
    layer.width = newWidth;
    if (layer.type === "text") {
      layer.fontSize = Math.max(4, start.fontSize * factor);
      layer.height = newHeight;
      this._layoutText(layer);
    } else if (layer.type === "shape") {
      layer.height = newHeight;
      layer.radius = Math.max(0, (start.radius || 0) * factor);
      layer.strokeWidth = Math.max(0, (start.strokeWidth || 0) * factor);
      layer.fontSize = Math.max(4, (start.fontSize || 48) * factor);
    } else {
      layer.height = newHeight;
    }
    this._render();
    this._notifyLayer(layer);
  }

  _onPointerUp(event) {
    if (!this.drag) return;
    const layer = this.layers.find((item) => item.id === this.drag.layerId);
    const moved = this.drag.moved;
    this.drag = null;
    this.guides = null;
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
    }
    this._render();
    if (layer) this._notifyLayer(layer);
    if (moved) this._notifyLayers();
  }

  _onDoubleClick(event) {
    const point = this._point(event);
    const hit = this._layerAt(point);
    if (hit && hit.type === "text") {
      this.select(hit.id);
      this.beginInlineEdit(hit.id);
    }
  }

  getSelected() {
    return this.layers.find((layer) => layer.id === this.selectedId) || null;
  }

  select(id) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this._render();
    this._notifySelection();
  }

  pushHistory() {
    this.history.push(this._snapshot());
    if (this.history.length > 30) this.history.shift();
    this.future = [];
    this._notifyHistory();
  }

  _snapshot() {
    return {
      doc: { ...this.doc },
      selectedId: this.selectedId,
      photoSlot: this.photoSlot ? { ...this.photoSlot } : null,
      templateId: this.templateId,
      layers: this.layers.map((layer) => {
        const copy = { ...layer };
        delete copy._img;
        delete copy._layout;
        return copy;
      }),
    };
  }

  undo() {
    if (!this.history.length) return;
    this.future.push(this._snapshot());
    this._applySnapshot(this.history.pop());
    this._notifyHistory();
  }

  redo() {
    if (!this.future.length) return;
    this.history.push(this._snapshot());
    this._applySnapshot(this.future.pop());
    this._notifyHistory();
  }

  _applySnapshot(snapshot) {
    if (!snapshot) return;
    this.commitInlineEdit();
    this.doc = { ...snapshot.doc };
    this.layers = snapshot.layers.map((layer) => ({ ...layer }));
    this.photoSlot = snapshot.photoSlot ? { ...snapshot.photoSlot } : null;
    this.templateId = snapshot.templateId || null;
    this.selectedId = this.layers.some((layer) => layer.id === snapshot.selectedId) ? snapshot.selectedId : null;
    for (const layer of this.layers) {
      if (layer.type === "image" && layer.src) this._loadLayerImage(layer);
      if (layer.type === "text") this._layoutText(layer);
    }
    this.resize();
    this._notifyDoc();
    this._notifyLayers();
    this._notifySelection();
  }

  _loadLayerImage(layer) {
    if (layer._img) return Promise.resolve(layer._img);
    const cached = this._imageCache.get(layer.src);
    if (cached) {
      layer._img = cached;
      this._render();
      return Promise.resolve(cached);
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        this._imageCache.set(layer.src, image);
        layer._img = image;
        this._render();
        resolve(image);
      };
      image.onerror = () => reject(new Error("Не удалось открыть изображение"));
      image.src = layer.src;
    });
  }

  // Прямоугольник обрезки "по рамке" (аналог object-fit: cover).
  coverRectFor(sourceWidth, sourceHeight, frame, focusX = 0.5, focusY = 0.5) {
    const targetRatio = frame.width / frame.height;
    const sourceRatio = sourceWidth / sourceHeight;
    const crop = { x: 0, y: 0, width: 1, height: 1 };
    if (sourceRatio > targetRatio) {
      crop.width = targetRatio / sourceRatio;
      crop.x = Math.max(0, Math.min(1 - crop.width, (1 - crop.width) * focusX));
    } else {
      crop.height = sourceRatio / targetRatio;
      crop.y = Math.max(0, Math.min(1 - crop.height, (1 - crop.height) * focusY));
    }
    return {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      crop,
    };
  }

  async addImageDataUrl(src, name = "Изображение") {
    const image = await this._loadImageSource(src);
    const maxWidth = this.doc.width * 0.88;
    const maxHeight = this.doc.height * 0.82;
    const factor = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const width = image.naturalWidth * factor;
    const height = image.naturalHeight * factor;
    const slot = this.photoSlot;
    const useSlot = slot && !this.layers.some((layer) => layer.type === "image" && layer.inSlot);
    const rect = useSlot
      ? this.coverRectFor(image.naturalWidth, image.naturalHeight, slot)
      : {
          x: (this.doc.width - width) / 2,
          y: (this.doc.height - height) / 2,
          width,
          height,
          crop: null,
        };
    const layer = {
      id: makeId("img"),
      type: "image",
      name,
      src,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      crop: rect.crop,
      inSlot: Boolean(useSlot),
      rotation: 0,
      opacity: 1,
      visible: true,
      flipX: false,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    };
    layer._img = image;
    this.pushHistory();
    this.layers.push(layer);
    this.selectedId = layer.id;
    this._render();
    this._notifyLayers();
    this._notifySelection();
    return layer;
  }

  async addImageFile(file) {
    const dataUrl = await readFileAsDataUrl(file);
    const name = (file.name || "Изображение").replace(/\.[^.]+$/, "");
    return this.addImageDataUrl(dataUrl, name);
  }

  _loadImageSource(src) {
    const cached = this._imageCache.get(src);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        this._imageCache.set(src, image);
        resolve(image);
      };
      image.onerror = () => reject(new Error("Не удалось открыть изображение"));
      image.src = src;
    });
  }

  // Применяет журнальный шаблон: заменяет слои, фон и зону для фото.
  applyTemplate(template, { background = true } = {}) {
    this.pushHistory();
    const layers = instantiateTemplate(template, this.doc);
    for (const layer of layers) {
      if (layer.type === "text") this._layoutText(layer);
    }
    this.layers = layers;
    this.templateId = template.id;
    this.photoSlot = template.photoSlot
      ? {
          x: template.photoSlot.x * this.doc.width,
          y: template.photoSlot.y * this.doc.height,
          width: template.photoSlot.width * this.doc.width,
          height: template.photoSlot.height * this.doc.height,
        }
      : null;
    if (background && template.background) {
      this.doc.background = template.background;
      this._notifyDoc();
    }
    this.selectedId = null;
    this._render();
    this._notifyDoc();
    this._notifyLayers();
    this._notifySelection();
    return layers;
  }

  addShapeLayer(overrides = {}) {
    const layer = {
      id: makeId("shape"),
      type: "shape",
      name: "Фигура",
      shape: "rect",
      x: this.doc.width * 0.3,
      y: this.doc.height * 0.35,
      width: this.doc.width * 0.4,
      height: this.doc.height * 0.12,
      rotation: 0,
      opacity: 1,
      visible: true,
      flipX: false,
      fill: "#ff5a36",
      gradient: null,
      stroke: null,
      strokeWidth: 0,
      radius: 12,
      label: "",
      fontFamily: "Montserrat, Arial, sans-serif",
      fontWeight: 800,
      fontSize: Math.round(this.doc.width * 0.03),
      letterSpacing: 0,
      labelColor: "#ffffff",
      ...overrides,
    };
    this.pushHistory();
    this.layers.push(layer);
    this.selectedId = layer.id;
    this._render();
    this._notifyLayers();
    this._notifySelection();
    return layer;
  }

  addTextLayer(overrides = {}) {
    const fontSize = Math.round(this.doc.width * 0.095);
    const layer = {
      id: makeId("text"),
      type: "text",
      name: "Текст",
      text: "НОВЫЙ ВЫПУСК",
      x: this.doc.width * 0.08,
      y: this.doc.height * 0.08,
      width: this.doc.width * 0.84,
      height: fontSize,
      rotation: 0,
      opacity: 1,
      visible: true,
      fontFamily: TEXT_FONT,
      fontSize,
      fontWeight: 900,
      italic: false,
      uppercase: true,
      align: "left",
      lineHeight: 0.95,
      letterSpacing: 0,
      color: "#ffffff",
      strokeColor: "#111111",
      strokeWidth: Math.round(fontSize * 0.05),
      backgroundEnabled: false,
      backgroundColor: "#ff5a36",
      backgroundPadding: Math.round(fontSize * 0.15),
      shadowEnabled: true,
      shadowColor: "#000000",
      shadowBlur: Math.round(fontSize * 0.12),
      ...overrides,
    };
    this.layoutTextNow(layer);
    this.pushHistory();
    this.layers.push(layer);
    this.selectedId = layer.id;
    this._render();
    this._notifyLayers();
    this._notifySelection();
    return layer;
  }

  layoutTextNow(layer) {
    this._layoutText(layer);
  }

  duplicateLayer(id) {
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return null;
    const original = this.layers[index];
    this.pushHistory();
    const copy = { ...original, id: makeId(original.type), x: original.x + 24, y: original.y + 24 };
    delete copy._layout;
    delete copy._img;
    if (original.type === "image") {
      copy.name = `${original.name} копия`;
      this._loadLayerImage(copy);
    } else {
      copy.name = `${original.name} копия`;
      this._layoutText(copy);
    }
    this.layers.splice(index + 1, 0, copy);
    this.selectedId = copy.id;
    this._render();
    this._notifyLayers();
    this._notifySelection();
    return copy;
  }

  deleteLayer(id) {
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    this.pushHistory();
    this.layers.splice(index, 1);
    if (this.selectedId === id) {
      const fallback = this.layers[Math.min(index, this.layers.length - 1)];
      this.selectedId = fallback ? fallback.id : null;
    }
    this._render();
    this._notifyLayers();
    this._notifySelection();
  }

  toggleVisibility(id) {
    const layer = this.layers.find((item) => item.id === id);
    if (!layer) return;
    this.pushHistory();
    layer.visible = !layer.visible;
    this._render();
    this._notifyLayers();
  }

  toggleLock(id) {
    const layer = this.layers.find((item) => item.id === id);
    if (!layer) return;
    this.pushHistory();
    layer.locked = !layer.locked;
    this._render();
    this._notifyLayers();
    if (layer.id === this.selectedId) this._notifySelection();
  }

  moveLayer(id, direction) {
    const index = this.layers.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.layers.length) return;
    this.pushHistory();
    const [layer] = this.layers.splice(index, 1);
    this.layers.splice(target, 0, layer);
    this._render();
    this._notifyLayers();
  }

  moveLayerToIndex(id, targetIndex) {
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    const clamped = Math.max(0, Math.min(this.layers.length - 1, targetIndex));
    if (clamped === index) return;
    this.pushHistory();
    const [layer] = this.layers.splice(index, 1);
    this.layers.splice(clamped, 0, layer);
    this._render();
    this._notifyLayers();
  }

  updateLayer(id, patch, options = {}) {
    const layer = this.layers.find((item) => item.id === id);
    if (!layer || (layer.locked && !options.force)) return;
    if (options.history) this.pushHistory();
    Object.assign(layer, patch);
    if (layer.type === "text") this._layoutText(layer);
    this._render();
    if (options.structural) this._notifyLayers();
    else this._notifyLayer(layer);
  }

  updateSelected(patch, options = {}) {
    if (!this.selectedId) return;
    this.updateLayer(this.selectedId, patch, options);
  }

  alignSelected(mode) {
    const layer = this.getSelected();
    if (!layer || layer.locked) return;
    this.pushHistory();
    if (mode === "left") layer.x = 0;
    else if (mode === "center") layer.x = (this.doc.width - layer.width) / 2;
    else if (mode === "right") layer.x = this.doc.width - layer.width;
    else if (mode === "top") layer.y = 0;
    else if (mode === "middle") layer.y = (this.doc.height - layer.height) / 2;
    else if (mode === "bottom") layer.y = this.doc.height - layer.height;
    this._render();
    this._notifyLayer(layer);
    this._notifyLayers();
  }

  nudgeSelected(dx, dy) {
    const layer = this.getSelected();
    if (!layer || layer.locked) return;
    this.pushHistory();
    layer.x += dx;
    layer.y += dy;
    this._render();
    this._notifyLayer(layer);
    this._notifyLayers();
  }

  replaceSelectedImage(file) {
    const layer = this.getSelected();
    if (!layer || layer.type !== "image") return Promise.resolve();
    return readFileAsDataUrl(file).then(async (dataUrl) => {
      const image = await this._loadImageSource(dataUrl);
      this.pushHistory();
      layer.src = dataUrl;
      layer._img = image;
      layer.naturalWidth = image.naturalWidth;
      layer.naturalHeight = image.naturalHeight;
      this._render();
      this._notifyLayer(layer);
      this._notifyLayers();
    });
  }

  async setLayerImageSource(id, src) {
    const layer = this.layers.find((item) => item.id === id);
    if (!layer || layer.type !== "image") return null;
    const image = await this._loadImageSource(src);
    this.pushHistory();
    layer.src = src;
    layer._img = image;
    layer.naturalWidth = image.naturalWidth;
    layer.naturalHeight = image.naturalHeight;
    this._render();
    this._notifyLayer(layer);
    this._notifyLayers();
    return layer;
  }

  async splitWithCutout(id, src, cutoutName, { blurBackground = true } = {}) {
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return null;
    const original = this.layers[index];
    if (original.type !== "image") return null;
    const image = await this._loadImageSource(src);
    this.pushHistory();
    const baseName = original.name;
    original.name = `Фон — ${baseName}`;
    if (blurBackground) {
      original.filters = {
        ...(original.filters || {}),
        blur: Math.round(this.doc.width * 0.008),
        brightness: 86,
        saturate: 88,
      };
    }
    const cutout = {
      ...original,
      id: makeId("img"),
      name: cutoutName || `Объект — ${baseName}`,
      src,
      _img: image,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      x: original.x,
      y: original.y,
      width: original.width,
      height: original.height,
      rotation: original.rotation,
      opacity: original.opacity,
      flipX: original.flipX,
      visible: true,
    };
    delete cutout._layout;
    this.layers.splice(index + 1, 0, cutout);
    this.selectedId = cutout.id;
    this._render();
    this._notifyLayers();
    this._notifySelection();
    return cutout;
  }

  fitSelectedImage({ cover = false, focusX = 0.5, focusY = 0.5, useSlot = false } = {}) {
    const layer = this.getSelected();
    if (!layer || layer.type !== "image" || !layer._img) return;
    this.pushHistory();
    layer.rotation = 0;
    if (cover || useSlot) {
      const frame = useSlot && this.photoSlot
        ? this.photoSlot
        : { x: this.doc.width * 0.05, y: this.doc.height * 0.05, width: this.doc.width * 0.9, height: this.doc.height * 0.9 };
      const rect = this.coverRectFor(layer.naturalWidth, layer.naturalHeight, frame, focusX, focusY);
      layer.x = rect.x;
      layer.y = rect.y;
      layer.width = rect.width;
      layer.height = rect.height;
      layer.crop = rect.crop;
      layer.inSlot = Boolean(useSlot);
    } else {
      const factor = Math.min(
        (this.doc.width * 0.9) / layer.naturalWidth,
        (this.doc.height * 0.9) / layer.naturalHeight,
      );
      layer.width = layer.naturalWidth * factor;
      layer.height = layer.naturalHeight * factor;
      layer.x = (this.doc.width - layer.width) / 2;
      layer.y = (this.doc.height - layer.height) / 2;
      layer.crop = null;
      layer.inSlot = false;
    }
    this._render();
    this._notifyLayer(layer);
    this._notifyLayers();
  }

  // Сдвигает точку обрезки без изменения размера рамки.
  setCropFocus(focusX, focusY) {
    const layer = this.getSelected();
    if (!layer || layer.type !== "image" || !layer.crop) return;
    this.pushHistory();
    const crop = this.coverRectFor(
      layer.naturalWidth,
      layer.naturalHeight,
      { x: 0, y: 0, width: layer.width, height: layer.height },
      focusX,
      focusY,
    ).crop;
    layer.crop = crop;
    this._render();
    this._notifyLayer(layer);
  }

  setDocumentSize(width, height) {
    width = Math.round(Math.max(320, Math.min(12000, width)));
    height = Math.round(Math.max(320, Math.min(12000, height)));
    if (width === this.doc.width && height === this.doc.height) return;
    this.pushHistory();
    const oldWidth = this.doc.width;
    const oldHeight = this.doc.height;
    const factor = Math.min(width / oldWidth, height / oldHeight);
    const offsetX = (width - oldWidth * factor) / 2;
    const offsetY = (height - oldHeight * factor) / 2;
    for (const layer of this.layers) {
      layer.x = layer.x * factor + offsetX;
      layer.y = layer.y * factor + offsetY;
      layer.width *= factor;
      layer.height *= factor;
      if (layer.type === "text") {
        layer.fontSize *= factor;
        layer.letterSpacing *= factor;
        layer.strokeWidth *= factor;
        layer.backgroundPadding *= factor;
        layer.shadowBlur *= factor;
        layer.shadowOffsetX = (layer.shadowOffsetX || 0) * factor;
        layer.plateStrokeWidth = (layer.plateStrokeWidth || 0) * factor;
        this._layoutText(layer);
      } else if (layer.type === "shape") {
        layer.strokeWidth = (layer.strokeWidth || 0) * factor;
        layer.radius = (layer.radius || 0) * factor;
        layer.fontSize = (layer.fontSize || 0) * factor;
        layer.letterSpacing = (layer.letterSpacing || 0) * factor;
      }
      if (layer.crop) {
        // Обрезка задана долями — масштабирование не требуется.
      }
    }
    if (this.photoSlot) {
      this.photoSlot.x = this.photoSlot.x * factor + offsetX;
      this.photoSlot.y = this.photoSlot.y * factor + offsetY;
      this.photoSlot.width *= factor;
      this.photoSlot.height *= factor;
    }
    this.doc.width = width;
    this.doc.height = height;
    this.resize();
    this._notifyDoc();
    this._notifyLayers();
    this._notifyLayer(this.getSelected());
  }

  setDocumentBackground(color, record = true) {
    if (this.doc.background === color) return;
    if (record) this.pushHistory();
    this.doc.background = color;
    this._render();
    this._notifyDoc();
  }

  beginInlineEdit(id = this.selectedId) {
    const layer = this.layers.find((item) => item.id === id);
    if (!layer || layer.type !== "text") return;
    this.commitInlineEdit();
    this.pushHistory();
    this.selectedId = id;
    this.editingId = id;
    this._editBackup = layer.text;
    this._layoutText(layer);
    this._render();
    this._notifySelection();
    const input = this.inlineInput;
    input.hidden = false;
    input.value = layer.text;
    this._positionInlineEditor(layer);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  _positionInlineEditor(layer) {
    const canvasRect = this.canvas.getBoundingClientRect();
    const wrapRect = this.wrap.getBoundingClientRect();
    const width = Math.max(40, layer.width * this.scale);
    const height = Math.max(30, layer.height * this.scale);
    const centerX = canvasRect.left - wrapRect.left + (layer.x + layer.width / 2) * this.scale;
    const centerY = canvasRect.top - wrapRect.top + (layer.y + layer.height / 2) * this.scale;
    const pad = layer._layout?.pad || 0;
    const style = this.inlineInput.style;
    style.width = `${Math.max(30, width - 8)}px`;
    style.height = `${Math.max(28, height)}px`;
    style.left = `${centerX - width / 2 + 4}px`;
    style.top = `${centerY - height / 2}px`;
    style.transform = `rotate(${layer.rotation || 0}deg)`;
    style.fontFamily = escapeForCss(layer.fontFamily);
    style.fontSize = `${layer.fontSize * this.scale}px`;
    style.fontWeight = layer.fontWeight;
    style.fontStyle = layer.italic ? "italic" : "normal";
    style.lineHeight = layer.lineHeight;
    style.letterSpacing = `${(layer.letterSpacing || 0) * this.scale}px`;
    style.textAlign = layer.align;
    style.textTransform = layer.uppercase ? "uppercase" : "none";
    style.color = layer.color;
    const rgb = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(layer.color || ""));
    const luminance = rgb
      ? parseInt(rgb[1], 16) * 0.299 + parseInt(rgb[2], 16) * 0.587 + parseInt(rgb[3], 16) * 0.114
      : 0;
    style.background = luminance > 150 ? "rgba(14,14,17,.92)" : "rgba(255,255,255,.94)";
    style.padding = `${Math.max(2, pad * this.scale)}px`;
  }

  commitInlineEdit() {
    if (!this.editingId) return;
    clearTimeout(this._inlineTimer);
    this.editingId = null;
    this._editBackup = null;
    this.inlineInput.hidden = true;
    this._render();
    this._notifyLayers();
  }

  cancelInlineEdit() {
    if (!this.editingId) return;
    const layer = this.layers.find((item) => item.id === this.editingId);
    if (layer && this._editBackup !== null) layer.text = this._editBackup;
    this.editingId = null;
    this._editBackup = null;
    this.inlineInput.hidden = true;
    this._render();
    this._notifySelection();
  }

  async waitForImages() {
    const pending = [];
    for (const layer of this.layers) {
      if (layer.type === "image" && !(layer._img && layer._img.complete)) {
        pending.push(this._loadLayerImage(layer).catch(() => null));
      }
    }
    await Promise.all(pending);
  }

  _applyFinish(ctx, finish) {
    if (!finish.grain && !finish.vignette) return;
    const w = this.doc.width;
    const h = this.doc.height;
    ctx.save();
    if (finish.vignette) {
      const strength = Math.min(1, Math.max(0, finish.vignette / 100));
      const gradient = ctx.createRadialGradient(
        w / 2, h / 2, Math.min(w, h) * 0.28,
        w / 2, h / 2, Math.max(w, h) * 0.78,
      );
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, `rgba(0,0,0,${(0.34 * strength).toFixed(3)})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
    if (finish.grain) {
      const size = 192;
      const noise = document.createElement("canvas");
      noise.width = size;
      noise.height = size;
      const noiseCtx = noise.getContext("2d");
      const data = noiseCtx.createImageData(size, size);
      const alpha = Math.round((Math.min(100, finish.grain) / 100) * 30);
      for (let index = 0; index < data.data.length; index += 4) {
        const value = Math.random() * 255;
        data.data[index] = value;
        data.data[index + 1] = value;
        data.data[index + 2] = value;
        data.data[index + 3] = alpha;
      }
      noiseCtx.putImageData(data, 0, 0);
      ctx.fillStyle = ctx.createPattern(noise, "repeat");
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  toJSON() {
    return {
      version: 2,
      doc: { ...this.doc },
      photoSlot: this.photoSlot ? { ...this.photoSlot } : null,
      templateId: this.templateId,
      selectedId: this.selectedId,
      layers: this.layers.map((layer) => {
        const copy = { ...layer };
        delete copy._img;
        delete copy._layout;
        return copy;
      }),
    };
  }

  async loadFromJSON(data) {
    if (!data || !data.doc || !Array.isArray(data.layers)) {
      throw new Error("Некорректный файл проекта");
    }
    this.pushHistory();
    this.doc = { ...data.doc };
    this.photoSlot = data.photoSlot ? { ...data.photoSlot } : null;
    this.templateId = data.templateId || null;
    this.layers = data.layers.map((layer) => ({ ...layer }));
    this.selectedId = this.layers.some((layer) => layer.id === data.selectedId) ? data.selectedId : null;
    await Promise.all(
      this.layers
        .filter((layer) => layer.type === "image" && layer.src)
        .map((layer) => this._loadLayerImage(layer).catch(() => null)),
    );
    for (const layer of this.layers) {
      if (layer.type === "text") this._layoutText(layer);
    }
    this.resize();
    this._notifyDoc();
    this._notifyLayers();
    this._notifySelection();
  }

  async exportBlob({ format = "png", scale = 1, quality = 0.92, transparent = false, finish = {} } = {}) {
    this.commitInlineEdit();
    await this.waitForImages();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(this.doc.width * scale);
    canvas.height = Math.round(this.doc.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (!(transparent && format === "png")) {
      ctx.fillStyle = this.doc.background;
      ctx.fillRect(0, 0, this.doc.width, this.doc.height);
    }
    for (const layer of this.layers) {
      if (!layer.visible || layer.overlay) continue;
      if (layer.type === "text") this._layoutText(layer);
      this._drawLayer(ctx, layer);
    }
    for (const layer of this.layers) {
      if (!layer.visible || !layer.overlay) continue;
      this._drawLayer(ctx, layer);
    }
    this._applyFinish(ctx, finish);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось создать файл"))),
        format === "jpeg" ? "image/jpeg" : "image/png",
        format === "jpeg" ? quality : undefined,
      );
    });
  }
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}
