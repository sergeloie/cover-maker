import { CoverEditor, DOC_PRESETS } from "./editor.js";

const $ = (id) => document.getElementById(id);

const els = {
  canvas: $("editor"),
  wrap: $("canvas-wrap"),
  inlineInput: $("inline-text"),
  docPreset: $("doc-preset"),
  docWidth: $("doc-width"),
  docHeight: $("doc-height"),
  docRotate: $("doc-rotate"),
  docBackground: $("doc-background"),
  stageTitle: $("stage-title"),
  stageMeta: $("stage-meta"),
  stageZoom: $("stage-zoom"),
  undo: $("undo"),
  redo: $("redo"),
  exportOpen: $("export-open"),
  addImage: $("add-image"),
  addText: $("add-text"),
  imageInput: $("image-input"),
  replaceInput: $("replace-input"),
  modelList: $("model-list"),
  deviceBadge: $("device-badge"),
  feather: $("feather"),
  featherValue: $("feather-value"),
  removeBg: $("remove-bg"),
  cutoutCompose: $("cutout-compose"),
  cutoutHint: $("cutout-hint"),
  layerList: $("layer-list"),
  layerCount: $("layer-count"),
  layerUp: $("layer-up"),
  layerDown: $("layer-down"),
  layerDuplicate: $("layer-duplicate"),
  layerDelete: $("layer-delete"),
  canvasEmpty: $("canvas-empty"),
  inspectorEmpty: $("inspector-empty"),
  inspectorImage: $("inspector-image"),
  inspectorText: $("inspector-text"),
  imagePreviewImg: $("image-preview-img"),
  imageName: $("image-name"),
  imageStats: $("image-stats"),
  imageOpacity: $("image-opacity"),
  imageOpacityValue: $("image-opacity-value"),
  imageRotation: $("image-rotation"),
  imageRotationValue: $("image-rotation-value"),
  imageFlip: $("image-flip"),
  imageFit: $("image-fit"),
  imageReplace: $("image-replace"),
  imageRemoveBg: $("image-remove-bg"),
  imageCutoutCompose: $("image-cutout-compose"),
  textContent: $("text-content"),
  textFamily: $("text-family"),
  textWeight: $("text-weight"),
  textSize: $("text-size"),
  textLineHeight: $("text-lineheight"),
  textTracking: $("text-tracking"),
  textAlign: $("text-align"),
  textItalic: $("text-italic"),
  textUppercase: $("text-uppercase"),
  textColor: $("text-color"),
  textColorHex: $("text-color-hex"),
  textStrokeColor: $("text-stroke-color"),
  textStrokeHex: $("text-stroke-hex"),
  textStrokeWidth: $("text-stroke-width"),
  textStrokeValue: $("text-stroke-value"),
  textBgColor: $("text-bg-color"),
  textBgHex: $("text-bg-hex"),
  textBgPadding: $("text-bg-padding"),
  textBgEnable: $("text-bg-enable"),
  textShadowColor: $("text-shadow-color"),
  textShadowHex: $("text-shadow-hex"),
  textShadowBlur: $("text-shadow-blur"),
  textShadowEnable: $("text-shadow-enable"),
  textOpacity: $("text-opacity"),
  textOpacityValue: $("text-opacity-value"),
  busy: $("busy"),
  busyTitle: $("busy-title"),
  busySubtitle: $("busy-subtitle"),
  exportModal: $("export-modal"),
  exportClose: $("export-close"),
  exportSummary: $("export-summary"),
  exportFormat: $("export-format"),
  exportScale: $("export-scale"),
  exportQualityRow: $("export-quality-row"),
  exportQuality: $("export-quality"),
  exportQualityValue: $("export-quality-value"),
  exportTransparent: $("export-transparent"),
  exportCancel: $("export-cancel"),
  exportDownload: $("export-download"),
  toasts: $("toasts"),
};

const state = {
  model: ["u2net", "modnet"].includes(localStorage.getItem("cover-maker-model"))
    ? localStorage.getItem("cover-maker-model")
    : "u2net",
  models: [],
  device: "",
  busy: false,
  modelPoll: null,
};

let historyGroup = { key: null, at: 0 };
let editor;

function normalizeHex(value) {
  if (typeof value !== "string") return null;
  let hex = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
}

function historyOnce(key) {
  const now = performance.now();
  const scoped = `${editor.selectedId || "none"}:${key}`;
  if (historyGroup.key !== scoped || now - historyGroup.at > 1300) {
    editor.pushHistory();
  }
  historyGroup = { key: scoped, at: now };
}

function toast(message, type = "info", timeout = 4200) {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  const text = document.createElement("span");
  text.textContent = message;
  node.appendChild(text);
  els.toasts.appendChild(node);
  while (els.toasts.children.length > 4) els.toasts.firstElementChild.remove();
  setTimeout(() => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 220);
  }, timeout);
}

function setBusy(active, title = "", subtitle = "") {
  state.busy = active;
  els.busy.hidden = !active;
  if (title) els.busyTitle.textContent = title;
  if (subtitle) els.busySubtitle.textContent = subtitle;
  updateLayerButtons();
  updateCutoutButtons();
}

function shortDevice(device) {
  if (!device) return "";
  return device.includes("GPU") ? "GPU" : "CPU";
}

function setControl(element, value) {
  if (document.activeElement === element) return;
  if (element.type === "checkbox") {
    element.checked = Boolean(value);
  } else if (element.type === "color") {
    element.value = normalizeHex(value) || "#000000";
  } else {
    element.value = value ?? "";
  }
}

function setColorPair(colorElement, hexElement, value) {
  const hex = normalizeHex(value) || "#000000";
  setControl(colorElement, hex);
  if (document.activeElement !== hexElement) hexElement.value = hex.toUpperCase();
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function renderModelStates() {
  for (const card of els.modelList.querySelectorAll(".model-card")) {
    const id = card.dataset.model;
    const info = state.models.find((model) => model.id === id);
    const output = card.querySelector("[data-state]");
    if (!info) {
      delete output.dataset.kind;
      output.textContent = "нет связи с сервером";
      continue;
    }
    if (info.state === "downloading") {
      output.dataset.kind = "downloading";
      output.textContent = "скачивается — подождите";
    } else if (info.state === "error") {
      output.dataset.kind = "error";
      output.textContent = "ошибка загрузки";
    } else if (info.downloaded) {
      output.dataset.kind = "ready";
      output.textContent = info.device ? `готова · ${shortDevice(info.device)}` : "готова";
    } else {
      delete output.dataset.kind;
      output.textContent = `скачается при первом запуске · ~${info.approxMb} МБ`;
    }
  }
  updateDeviceBadge();
}

function updateDeviceBadge() {
  const loaded = state.models.find((model) => model.device);
  const device = loaded?.device || state.device;
  els.deviceBadge.textContent = device ? `локально · ${shortDevice(device)}` : "локально";
  els.deviceBadge.title = device
    ? `Обработка идёт на этом компьютере: ${device}`
    : "Обработка идёт на этом компьютере";
}

async function refreshModels() {
  try {
    const response = await fetch("/api/models", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.models = data.models;
    state.device = data.device;
    renderModelStates();
    clearTimeout(state.modelPoll);
    if (data.models.some((model) => model.state === "downloading")) {
      state.modelPoll = setTimeout(refreshModels, 1500);
    }
  } catch (error) {
    console.error("models request failed", error);
    if (!state.models.length) {
      for (const output of els.modelList.querySelectorAll("[data-state]")) {
        output.textContent = "нет связи с сервером";
      }
    }
  }
}

function updateCutoutButtons() {
  const layer = editor?.getSelected();
  const isImage = Boolean(layer && layer.type === "image");
  const disabled = !isImage || state.busy;
  els.removeBg.disabled = disabled;
  els.cutoutCompose.disabled = disabled;
  els.imageRemoveBg.disabled = disabled;
  els.imageCutoutCompose.disabled = disabled;
  els.imageReplace.disabled = state.busy;
  if (!isImage) {
    els.cutoutHint.textContent =
      "Выберите слой с изображением. Кнопка создаст копию: оригинал останется снизу, вырезанный объект — сверху.";
  } else if (state.busy) {
    els.cutoutHint.textContent = "Модель работает локально. Первый запуск может скачать веса модели.";
  } else {
    els.cutoutHint.textContent =
      "Дублирует слой: копия с фоном остаётся снизу, слой с вырезанным объектом поднимается выше.";
  }
}

function updateLayerButtons() {
  const layer = editor?.getSelected();
  const index = layer ? editor.layers.findIndex((item) => item.id === layer.id) : -1;
  els.layerUp.disabled = !layer || state.busy || index === editor.layers.length - 1;
  els.layerDown.disabled = !layer || state.busy || index <= 0;
  els.layerDuplicate.disabled = !layer || state.busy;
  els.layerDelete.disabled = !layer || state.busy;
}

function renderLayers() {
  const layers = editor.layers;
  els.layerCount.textContent = String(layers.length);
  els.canvasEmpty.hidden = layers.length > 0;
  els.layerList.textContent = "";
  if (!layers.length) {
    const empty = document.createElement("div");
    empty.className = "empty-layers";
    empty.textContent = "Пока пусто. Добавьте фото или текст.";
    els.layerList.appendChild(empty);
    updateLayerButtons();
    updateCutoutButtons();
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const layer of [...layers].reverse()) {
    const item = document.createElement("div");
    item.className = `layer-item${layer.id === editor.selectedId ? " selected" : ""}`;
    item.dataset.id = layer.id;
    const thumb = document.createElement("div");
    thumb.className = `layer-thumb${layer.type === "image" ? " checker" : ""}`;
    if (layer.type === "image") {
      thumb.style.backgroundImage = `url("${layer.src}")`;
    } else {
      thumb.textContent = "T";
    }
    const meta = document.createElement("div");
    meta.className = "layer-meta";
    const name = document.createElement("span");
    name.className = "layer-name";
    name.textContent = layer.name;
    const kind = document.createElement("span");
    kind.className = "layer-kind";
    kind.textContent = layer.type === "image" ? "изображение" : "текст";
    meta.append(name, kind);
    const eye = document.createElement("button");
    eye.className = `layer-eye${layer.visible ? "" : " off"}`;
    eye.title = layer.visible ? "Скрыть слой" : "Показать слой";
    eye.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>';
    eye.addEventListener("click", (event) => {
      event.stopPropagation();
      editor.toggleVisibility(layer.id);
    });
    item.append(thumb, meta, eye);
    item.addEventListener("click", () => editor.select(layer.id));
    item.addEventListener("dblclick", () => {
      editor.select(layer.id);
      if (layer.type === "text") editor.beginInlineEdit(layer.id);
    });
    fragment.appendChild(item);
  }
  els.layerList.appendChild(fragment);
  updateLayerButtons();
  updateCutoutButtons();
}

function populateInspector(layer) {
  if (!layer) return;
  if (layer.type === "image") {
    els.imageName.textContent = layer.name;
    els.imagePreviewImg.src = layer.src;
    els.imageStats.textContent = `${layer.naturalWidth || "?"} × ${layer.naturalHeight || "?"} px · на холсте ${Math.round(layer.width)} × ${Math.round(layer.height)}`;
    if (document.activeElement !== els.imageOpacity) {
      els.imageOpacity.value = String(Math.round((layer.opacity ?? 1) * 100));
    }
    els.imageOpacityValue.textContent = `${Math.round((layer.opacity ?? 1) * 100)}%`;
    if (document.activeElement !== els.imageRotation) {
      els.imageRotation.value = String(Math.round(layer.rotation || 0));
    }
    els.imageRotationValue.textContent = `${Math.round(layer.rotation || 0)}°`;
    return;
  }
  setControl(els.textContent, layer.text);
  setControl(els.textFamily, layer.fontFamily);
  setControl(els.textWeight, String(layer.fontWeight));
  setControl(els.textSize, Math.round(layer.fontSize));
  setControl(els.textLineHeight, layer.lineHeight);
  setControl(els.textTracking, Math.round(layer.letterSpacing || 0));
  for (const button of els.textAlign.querySelectorAll("[data-align]")) {
    button.classList.toggle("active", button.dataset.align === layer.align);
  }
  els.textItalic.classList.toggle("active", Boolean(layer.italic));
  els.textUppercase.classList.toggle("active", Boolean(layer.uppercase));
  setColorPair(els.textColor, els.textColorHex, layer.color);
  setColorPair(els.textStrokeColor, els.textStrokeHex, layer.strokeColor);
  setColorPair(els.textBgColor, els.textBgHex, layer.backgroundColor);
  setColorPair(els.textShadowColor, els.textShadowHex, layer.shadowColor);
  if (document.activeElement !== els.textStrokeWidth) {
    els.textStrokeWidth.value = String(Math.round(layer.strokeWidth || 0));
  }
  els.textStrokeValue.textContent = `${Math.round(layer.strokeWidth || 0)} px`;
  setControl(els.textBgEnable, layer.backgroundEnabled);
  setControl(els.textBgPadding, Math.round(layer.backgroundPadding || 0));
  setControl(els.textShadowEnable, layer.shadowEnabled);
  setControl(els.textShadowBlur, Math.round(layer.shadowBlur || 0));
  if (document.activeElement !== els.textOpacity) {
    els.textOpacity.value = String(Math.round((layer.opacity ?? 1) * 100));
  }
  els.textOpacityValue.textContent = `${Math.round((layer.opacity ?? 1) * 100)}%`;
  els.inspectorText.dataset.layerId = layer.id;
}

function onSelectionChange(layer) {
  historyGroup = { key: null, at: 0 };
  els.inspectorEmpty.hidden = Boolean(layer);
  els.inspectorImage.hidden = !(layer && layer.type === "image");
  els.inspectorText.hidden = !(layer && layer.type === "text");
  if (layer) populateInspector(layer);
  updateLayerButtons();
  updateCutoutButtons();
  renderLayersSelection();
}

function renderLayersSelection() {
  for (const item of els.layerList.querySelectorAll(".layer-item")) {
    item.classList.toggle("selected", item.dataset.id === editor.selectedId);
  }
}

function onLayerUpdate(layer) {
  if (!layer || layer.id !== editor.selectedId) return;
  populateInspector(layer);
  updateLayerButtons();
}

function onDocChange(doc) {
  if (document.activeElement !== els.docWidth) els.docWidth.value = String(doc.width);
  if (document.activeElement !== els.docHeight) els.docHeight.value = String(doc.height);
  els.docBackground.value = doc.background;
  const preset = Object.entries(DOC_PRESETS).find(
    ([, value]) => value.width === doc.width && value.height === doc.height,
  );
  els.docPreset.value = preset ? preset[0] : "custom";
  els.stageTitle.textContent = preset ? preset[1].title : "Свой формат";
  els.stageMeta.textContent = `${doc.width} × ${doc.height} px`;
}

function onViewChange({ scale }) {
  els.stageZoom.textContent = `вписано · ${Math.round(scale * 100)}%`;
}

function onHistoryChange({ canUndo, canRedo }) {
  els.undo.disabled = !canUndo;
  els.redo.disabled = !canRedo;
}

function initEditor() {
  editor = new CoverEditor({
    canvas: els.canvas,
    wrap: els.wrap,
    inlineInput: els.inlineInput,
    callbacks: {
      onSelectionChange,
      onLayersChange: renderLayers,
      onLayerUpdate,
      onDocChange,
      onViewChange,
      onHistoryChange,
    },
  });
}

function seedStarter() {
  if (editor.layers.length) return;
  const width = editor.doc.width;
  const height = editor.doc.height;
  editor.addTextLayer({
    name: "Заголовок",
    text: "НОВЫЙ\nВЫПУСК",
    x: width * 0.07,
    y: height * 0.055,
    width: width * 0.86,
    fontSize: Math.round(width * 0.15),
    lineHeight: 0.9,
    fontWeight: 900,
    color: "#f7f2e7",
    strokeColor: "#121212",
    strokeWidth: Math.round(width * 0.006),
    align: "left",
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowBlur: Math.round(width * 0.008),
  });
  editor.addTextLayer({
    name: "Подзаголовок",
    text: "ИСТОРИИ, КОТОРЫЕ\nВДОХНОВЛЯЮТ",
    x: width * 0.07,
    y: height * 0.755,
    width: width * 0.74,
    fontSize: Math.round(width * 0.043),
    fontFamily: "'Arial Black', Arial, sans-serif",
    fontWeight: 800,
    lineHeight: 1.05,
    letterSpacing: 2,
    color: "#191310",
    strokeWidth: 0,
    backgroundEnabled: true,
    backgroundColor: "#f2c14e",
    backgroundPadding: Math.round(width * 0.014),
    shadowEnabled: false,
    align: "left",
    uppercase: true,
  });
  editor.addTextLayer({
    name: "Номер выпуска",
    text: "№ 01 — 2026",
    x: width * 0.55,
    y: height * 0.925,
    width: width * 0.38,
    fontSize: Math.round(width * 0.028),
    fontFamily: "Arial, Helvetica, sans-serif",
    fontWeight: 600,
    align: "right",
    color: "#f7f2e7",
    strokeWidth: 0,
    uppercase: true,
    letterSpacing: 3,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowBlur: 10,
  });
  editor.select(null);
  editor.history = [];
  editor.future = [];
  onHistoryChange({ canUndo: false, canRedo: false });
}

function bindColorPair(colorElement, hexElement, property, key) {
  colorElement.addEventListener("input", () => {
    hexElement.value = colorElement.value.toUpperCase();
    historyOnce(key);
    editor.updateSelected({ [property]: colorElement.value });
  });
  hexElement.addEventListener("input", () => {
    const hex = normalizeHex(hexElement.value);
    if (!hex) return;
    colorElement.value = hex;
    historyOnce(key);
    editor.updateSelected({ [property]: hex });
  });
  hexElement.addEventListener("blur", () => {
    const hex = normalizeHex(hexElement.value);
    if (!hex) {
      hexElement.value = (colorElement.value || "#000000").toUpperCase();
    } else {
      hexElement.value = hex.toUpperCase();
    }
  });
}

function bindRange(element, output, property, fromRange, toDisplay, key) {
  element.addEventListener("input", () => {
    const value = fromRange(Number(element.value));
    historyOnce(key || property);
    editor.updateSelected({ [property]: value });
    if (output) output.textContent = toDisplay(value);
  });
}

function bindNumber(element, property, { min = -Infinity, max = Infinity, key, history = true } = {}) {
  element.addEventListener("input", () => {
    const raw = Number(element.value);
    if (!Number.isFinite(raw)) return;
    const value = Math.min(max, Math.max(min, raw));
    if (history) historyOnce(key || property);
    editor.updateSelected({ [property]: value });
  });
}

function bindInspector() {
  els.textContent.addEventListener("input", () => {
    historyOnce("text");
    editor.updateSelected({ text: els.textContent.value });
  });
  els.textFamily.addEventListener("change", () => {
    historyOnce("family");
    editor.updateSelected({ fontFamily: els.textFamily.value });
  });
  els.textWeight.addEventListener("change", () => {
    historyOnce("weight");
    editor.updateSelected({ fontWeight: Number(els.textWeight.value) });
  });
  els.textSize.addEventListener("input", () => {
    const value = clampNumber(els.textSize.value, 8, 2000, 8);
    historyOnce("size");
    editor.updateSelected({ fontSize: value });
  });
  els.textLineHeight.addEventListener("input", () => {
    const value = clampNumber(els.textLineHeight.value, 0.7, 2.5, 1);
    historyOnce("lineheight");
    editor.updateSelected({ lineHeight: value });
  });
  els.textTracking.addEventListener("input", () => {
    const value = clampNumber(els.textTracking.value, -20, 100, 0);
    historyOnce("tracking");
    editor.updateSelected({ letterSpacing: value });
  });
  for (const button of els.textAlign.querySelectorAll("[data-align]")) {
    button.addEventListener("click", () => {
      historyOnce("align");
      editor.updateSelected({ align: button.dataset.align });
      for (const other of els.textAlign.querySelectorAll("[data-align]")) {
        other.classList.toggle("active", other === button);
      }
    });
  }
  els.textItalic.addEventListener("click", () => {
    const layer = editor.getSelected();
    if (!layer) return;
    historyOnce("italic");
    editor.updateSelected({ italic: !layer.italic });
    els.textItalic.classList.toggle("active", !layer.italic);
  });
  els.textUppercase.addEventListener("click", () => {
    const layer = editor.getSelected();
    if (!layer) return;
    historyOnce("uppercase");
    editor.updateSelected({ uppercase: !layer.uppercase });
    els.textUppercase.classList.toggle("active", !layer.uppercase);
  });
  bindColorPair(els.textColor, els.textColorHex, "color", "color");
  bindColorPair(els.textStrokeColor, els.textStrokeHex, "strokeColor", "stroke-color");
  bindColorPair(els.textBgColor, els.textBgHex, "backgroundColor", "bg-color");
  bindColorPair(els.textShadowColor, els.textShadowHex, "shadowColor", "shadow-color");
  els.textStrokeWidth.addEventListener("input", () => {
    const value = Number(els.textStrokeWidth.value);
    historyOnce("stroke-width");
    editor.updateSelected({ strokeWidth: value });
    els.textStrokeValue.textContent = `${Math.round(value)} px`;
  });
  els.textBgEnable.addEventListener("change", () => {
    historyOnce("bg-enabled");
    editor.updateSelected({ backgroundEnabled: els.textBgEnable.checked });
  });
  bindNumber(els.textBgPadding, "backgroundPadding", { min: 0, max: 200, key: "bg-padding" });
  els.textShadowEnable.addEventListener("change", () => {
    historyOnce("shadow-enabled");
    editor.updateSelected({ shadowEnabled: els.textShadowEnable.checked });
  });
  bindNumber(els.textShadowBlur, "shadowBlur", { min: 0, max: 200, key: "shadow-blur" });
  bindRange(els.textOpacity, els.textOpacityValue, "opacity", (value) => value / 100, (value) => `${Math.round(value * 100)}%`);
  bindRange(els.imageOpacity, els.imageOpacityValue, "opacity", (value) => value / 100, (value) => `${Math.round(value * 100)}%`);
  bindRange(els.imageRotation, els.imageRotationValue, "rotation", (value) => value, (value) => `${Math.round(value)}°`);

  els.imageFlip.addEventListener("click", () => {
    const layer = editor.getSelected();
    if (!layer || layer.type !== "image") return;
    historyOnce("flip");
    editor.updateSelected({ flipX: !layer.flipX });
  });
  els.imageFit.addEventListener("click", () => editor.fitSelectedImage());
  els.imageReplace.addEventListener("click", () => els.replaceInput.click());
  els.imageRemoveBg.addEventListener("click", () => runCutout("replace"));
  els.imageCutoutCompose.addEventListener("click", () => runCutout("split"));
}

function bindAppControls() {
  els.undo.addEventListener("click", () => editor.undo());
  els.redo.addEventListener("click", () => editor.redo());
  els.addImage.addEventListener("click", () => els.imageInput.click());
  els.addText.addEventListener("click", () => editor.addTextLayer());
  els.imageInput.addEventListener("change", async () => {
    const files = [...els.imageInput.files];
    els.imageInput.value = "";
    for (const file of files) {
      try {
        await editor.addImageFile(file);
      } catch (error) {
        toast(error.message, "error");
      }
    }
    if (files.length) toast(`Добавлено изображений: ${files.length}`, "success", 2500);
  });
  els.replaceInput.addEventListener("change", async () => {
    const file = els.replaceInput.files?.[0];
    els.replaceInput.value = "";
    if (!file) return;
    try {
      await editor.replaceSelectedImage(file);
      toast("Изображение заменено", "success", 2500);
    } catch (error) {
      toast(error.message, "error");
    }
  });
  els.removeBg.addEventListener("click", () => runCutout("replace"));
  els.cutoutCompose.addEventListener("click", () => runCutout("split"));
  els.layerUp.addEventListener("click", () => editor.moveLayer(editor.selectedId, 1));
  els.layerDown.addEventListener("click", () => editor.moveLayer(editor.selectedId, -1));
  els.layerDuplicate.addEventListener("click", () => editor.duplicateLayer(editor.selectedId));
  els.layerDelete.addEventListener("click", () => editor.deleteLayer(editor.selectedId));
  els.feather.addEventListener("input", () => {
    els.featherValue.textContent = `${els.feather.value} px`;
  });

  for (const radio of document.querySelectorAll('input[name="bg-model"]')) {
    radio.checked = radio.value === state.model;
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      state.model = radio.value;
      localStorage.setItem("cover-maker-model", state.model);
    });
  }

  els.docPreset.addEventListener("change", () => {
    const preset = DOC_PRESETS[els.docPreset.value];
    if (!preset) return;
    editor.setDocumentSize(preset.width, preset.height);
  });
  els.docWidth.addEventListener("change", () => {
    const value = Number(els.docWidth.value);
    if (!Number.isFinite(value)) {
      onDocChange(editor.doc);
      return;
    }
    editor.setDocumentSize(value, editor.doc.height);
  });
  els.docHeight.addEventListener("change", () => {
    const value = Number(els.docHeight.value);
    if (!Number.isFinite(value)) {
      onDocChange(editor.doc);
      return;
    }
    editor.setDocumentSize(editor.doc.width, value);
  });
  els.docRotate.addEventListener("click", () => {
    editor.setDocumentSize(editor.doc.height, editor.doc.width);
  });
  els.docBackground.addEventListener("input", () => {
    historyOnce("doc-background");
    editor.setDocumentBackground(els.docBackground.value, false);
  });

  els.exportOpen.addEventListener("click", openExport);
  els.exportClose.addEventListener("click", closeExport);
  els.exportCancel.addEventListener("click", closeExport);
  els.exportModal.addEventListener("click", (event) => {
    if (event.target === els.exportModal) closeExport();
  });
  els.exportFormat.addEventListener("change", updateExportOptions);
  els.exportScale.addEventListener("change", updateExportSummary);
  els.exportQuality.addEventListener("input", () => {
    els.exportQualityValue.textContent = `${els.exportQuality.value}%`;
  });
  els.exportTransparent.addEventListener("change", updateExportSummary);
  els.exportDownload.addEventListener("click", downloadExport);

  els.wrap.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.wrap.classList.add("drag-over");
  });
  els.wrap.addEventListener("dragleave", (event) => {
    if (!els.wrap.contains(event.relatedTarget)) els.wrap.classList.remove("drag-over");
  });
  els.wrap.addEventListener("drop", async (event) => {
    event.preventDefault();
    els.wrap.classList.remove("drag-over");
    const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    for (const file of files) {
      try {
        await editor.addImageFile(file);
      } catch (error) {
        toast(error.message, "error");
      }
    }
  });
}

async function apiRemoveBackground(blob, model, feather) {
  const form = new FormData();
  form.append("file", blob, "cover-source.png");
  form.append("model", model);
  form.append("feather", String(feather));
  const response = await fetch("/api/remove-background", { method: "POST", body: form });
  if (!response.ok) {
    let detail = `Ошибка сервера (${response.status})`;
    try {
      const data = await response.json();
      if (data.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
    }
    throw new Error(detail);
  }
  return {
    blob: await response.blob(),
    meta: {
      device: response.headers.get("X-Cover-Device") || "",
      elapsedMs: Number(response.headers.get("X-Cover-Duration-Ms") || 0),
      model: response.headers.get("X-Cover-Model") || model,
    },
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Не удалось прочитать результат"));
    reader.readAsDataURL(blob);
  });
}

async function runCutout(mode) {
  if (state.busy) return;
  const layer = editor.getSelected();
  if (!layer || layer.type !== "image") {
    toast("Сначала выберите слой с изображением", "info");
    return;
  }
  const baseName = layer.name;
  const modelInfo = state.models.find((model) => model.id === state.model);
  const modelLabel = modelInfo?.label || (state.model === "u2net" ? "U²-Net" : "MODNet");
  const downloadNote = modelInfo && !modelInfo.downloaded
    ? ` · веса скачаются один раз (~${modelInfo.approxMb} МБ)`
    : "";
  setBusy(
    true,
    mode === "split" ? "Вырезаем объект" : "Удаляем фон",
    `${modelLabel} · локально${downloadNote}`,
  );
  try {
    const sourceBlob = await (await fetch(layer.src)).blob();
    const feather = Number(els.feather.value) || 0;
    const result = await apiRemoveBackground(sourceBlob, state.model, feather);
    const dataUrl = await blobToDataUrl(result.blob);
    const seconds = result.meta.elapsedMs ? `${(result.meta.elapsedMs / 1000).toFixed(1)} с` : "";
    const device = shortDevice(result.meta.device);
    if (mode === "split") {
      await editor.splitWithCutout(layer.id, dataUrl, `Объект — ${baseName}`);
      toast(
        `Объект вырезан: «${baseName}» остался снизу, копия объекта поднята выше. ${modelLabel}${device ? ` · ${device}` : ""}${seconds ? ` · ${seconds}` : ""}`,
        "success",
        6500,
      );
    } else {
      await editor.setLayerImageSource(layer.id, dataUrl);
      toast(
        `Фон удалён · ${modelLabel}${device ? ` · ${device}` : ""}${seconds ? ` · ${seconds}` : ""}`,
        "success",
        5000,
      );
    }
    if (result.meta.device) {
      state.device = result.meta.device;
      updateDeviceBadge();
    }
    refreshModels();
  } catch (error) {
    console.error(error);
    toast(error.message || "Не удалось обработать изображение", "error", 7000);
  } finally {
    setBusy(false);
  }
}

function updateExportOptions() {
  const format = els.exportFormat.value;
  els.exportQualityRow.hidden = format !== "jpeg";
  els.exportTransparent.disabled = format === "jpeg";
  if (format === "jpeg") els.exportTransparent.checked = false;
  updateExportSummary();
}

function updateExportSummary() {
  const scale = Number(els.exportScale.value) || 1;
  const width = Math.round(editor.doc.width * scale);
  const height = Math.round(editor.doc.height * scale);
  const format = els.exportFormat.value.toUpperCase();
  const transparent = els.exportTransparent.checked && els.exportFormat.value === "png";
  els.exportSummary.textContent = `${width} × ${height} px · ${format}${transparent ? " · прозрачный фон" : ""}`;
}

function openExport() {
  editor.commitInlineEdit();
  updateExportOptions();
  els.exportModal.hidden = false;
  els.exportDownload.disabled = false;
  els.exportDownload.textContent = "Скачать файл";
  els.exportDownload.focus();
}

function closeExport() {
  els.exportModal.hidden = true;
}

async function downloadExport() {
  const format = els.exportFormat.value;
  const scale = Number(els.exportScale.value) || 1;
  const transparent = els.exportTransparent.checked && format === "png";
  els.exportDownload.disabled = true;
  els.exportDownload.textContent = "Готовим файл…";
  try {
    const blob = await editor.exportBlob({
      format,
      scale,
      quality: Number(els.exportQuality.value) / 100,
      transparent,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const ext = format === "jpeg" ? "jpg" : "png";
    link.download = `cover-${Math.round(editor.doc.width * scale)}x${Math.round(editor.doc.height * scale)}.${ext}`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 2000);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast("Файл готов и сохранён", "success", 3000);
    closeExport();
  } catch (error) {
    console.error(error);
    toast(error.message || "Не удалось подготовить файл", "error");
    els.exportDownload.disabled = false;
    els.exportDownload.textContent = "Скачать файл";
  }
}

function isEditableTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function bindKeyboard() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!els.exportModal.hidden) {
        closeExport();
        return;
      }
      if (editor.editingId) return;
      if (editor.selectedId) editor.select(null);
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier) {
      if (isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        editor.redo();
        return;
      }
      if (key === "d") {
        event.preventDefault();
        editor.duplicateLayer(editor.selectedId);
        return;
      }
      if (key === "e") {
        event.preventDefault();
        openExport();
        return;
      }
    }
    if (isEditableTarget(event.target)) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      if (editor.selectedId) {
        event.preventDefault();
        editor.deleteLayer(editor.selectedId);
      }
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const moves = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    if (moves[event.key] && editor.selectedId) {
      event.preventDefault();
      editor.nudgeSelected(...moves[event.key]);
    }
  });
}

async function init() {
  initEditor();
  bindInspector();
  bindAppControls();
  bindKeyboard();
  renderLayers();
  onSelectionChange(null);
  onDocChange(editor.doc);
  seedStarter();
  renderLayers();
  onSelectionChange(null);
  await refreshModels();
  window.coverMaker = { editor, state, runCutout, refreshModels };
}

init().catch((error) => {
  console.error(error);
  toast(`Ошибка запуска: ${error.message}`, "error", 10000);
});
