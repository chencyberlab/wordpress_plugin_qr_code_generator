(function () {
	'use strict';

	// ---------- utils ----------
	function debounce(fn, wait) {
		var t;
		return function () {
			var ctx = this, args = arguments;
			clearTimeout(t);
			t = setTimeout(function () { fn.apply(ctx, args); }, wait);
		};
	}

	function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

	function normalizeHex(input) {
		if (typeof input !== 'string') return null;
		var s = input.trim();
		if (!s) return null;
		if (s.charAt(0) !== '#') s = '#' + s;
		if (/^#[0-9a-fA-F]{3}$/.test(s)) {
			s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
		}
		if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
		return null;
	}

	function hexToRgb(hex) {
		var n = normalizeHex(hex);
		if (!n) return null;
		return {
			r: parseInt(n.substr(1, 2), 16),
			g: parseInt(n.substr(3, 2), 16),
			b: parseInt(n.substr(5, 2), 16)
		};
	}

	function rgbToHex(r, g, b) {
		function p(v) { var s = clamp(Math.round(v), 0, 255).toString(16); return s.length === 1 ? '0' + s : s; }
		return ('#' + p(r) + p(g) + p(b)).toUpperCase();
	}

	function rgbToHsv(r, g, b) {
		r /= 255; g /= 255; b /= 255;
		var max = Math.max(r, g, b), min = Math.min(r, g, b);
		var d = max - min;
		var h = 0, s = max === 0 ? 0 : d / max, v = max;
		if (d !== 0) {
			switch (max) {
				case r: h = ((g - b) / d) % 6; break;
				case g: h = (b - r) / d + 2; break;
				case b: h = (r - g) / d + 4; break;
			}
			h *= 60;
			if (h < 0) h += 360;
		}
		return { h: h, s: s, v: v };
	}

	function hsvToRgb(h, s, v) {
		var c = v * s;
		var hp = h / 60;
		var x = c * (1 - Math.abs((hp % 2) - 1));
		var r = 0, g = 0, b = 0;
		if (0 <= hp && hp < 1) { r = c; g = x; }
		else if (1 <= hp && hp < 2) { r = x; g = c; }
		else if (2 <= hp && hp < 3) { g = c; b = x; }
		else if (3 <= hp && hp < 4) { g = x; b = c; }
		else if (4 <= hp && hp < 5) { r = x; b = c; }
		else if (5 <= hp && hp < 6) { r = c; b = x; }
		var m = v - c;
		return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
	}

	function relativeLuminance(r, g, b) {
		function conv(v) {
			v = v / 255;
			return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
		}
		return 0.2126 * conv(r) + 0.7152 * conv(g) + 0.0722 * conv(b);
	}

	function contrastRatio(hex1, hex2) {
		var a = hexToRgb(hex1); var b = hexToRgb(hex2);
		if (!a || !b) return 1;
		var l1 = relativeLuminance(a.r, a.g, a.b);
		var l2 = relativeLuminance(b.r, b.g, b.b);
		var lighter = Math.max(l1, l2);
		var darker = Math.min(l1, l2);
		return (lighter + 0.05) / (darker + 0.05);
	}

	// ---------- color picker ----------
	function ColorPicker(wrapper, onChange) {
		this.wrapper = wrapper;
		this.el = wrapper.querySelector('.rt-qr-picker');
		this.sv = this.el.querySelector('.rt-qr-picker-sv');
		this.svCursor = this.el.querySelector('.rt-qr-picker-sv-cursor');
		this.hueInput = this.el.querySelector('.rt-qr-picker-hue-input');
		this.hexInput = this.el.querySelector('.rt-qr-picker-hex input');
		this.rInput = this.el.querySelector('.rt-qr-picker-r input');
		this.gInput = this.el.querySelector('.rt-qr-picker-g input');
		this.bInput = this.el.querySelector('.rt-qr-picker-b input');
		this.closeBtn = this.el.querySelector('.rt-qr-picker-close');
		this.onChange = onChange;
		this.hsv = { h: 0, s: 0, v: 0 };
		this.activeChip = null;
		this._bindEvents();
	}

	ColorPicker.prototype.open = function (chip, hex) {
		this.activeChip = chip;
		var rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
		this.hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
		this._syncUI();
		this.el.hidden = false;
		this._position(chip);
		// Outside click/Esc
		var self = this;
		setTimeout(function () {
			document.addEventListener('mousedown', self._outside = function (e) {
				if (!self.el.contains(e.target) && e.target !== chip && !chip.contains(e.target)) {
					self.close();
				}
			});
			document.addEventListener('keydown', self._esc = function (e) {
				if (e.key === 'Escape') self.close();
			});
		}, 0);
	};

	ColorPicker.prototype.close = function () {
		this.el.hidden = true;
		this.activeChip = null;
		if (this._outside) document.removeEventListener('mousedown', this._outside);
		if (this._esc) document.removeEventListener('keydown', this._esc);
		this._outside = null; this._esc = null;
	};

	ColorPicker.prototype._position = function (chip) {
		var wrapRect = this.wrapper.getBoundingClientRect();
		var chipRect = chip.getBoundingClientRect();
		var top = chipRect.bottom - wrapRect.top + 6;
		var left = chipRect.left - wrapRect.left;
		// Keep within wrapper bounds
		var maxLeft = wrapRect.width - this.el.offsetWidth;
		if (left > maxLeft) left = Math.max(0, maxLeft);
		this.el.style.top = top + 'px';
		this.el.style.left = left + 'px';
	};

	ColorPicker.prototype._syncUI = function () {
		// Hue fill
		var hueRgb = hsvToRgb(this.hsv.h, 1, 1);
		this.sv.style.background = 'rgb(' + Math.round(hueRgb.r) + ',' + Math.round(hueRgb.g) + ',' + Math.round(hueRgb.b) + ')';
		// Cursor position
		var rect = this.sv.getBoundingClientRect();
		var w = rect.width || this.sv.offsetWidth || 240;
		var h = rect.height || this.sv.offsetHeight || 150;
		this.svCursor.style.left = (this.hsv.s * w) + 'px';
		this.svCursor.style.top = ((1 - this.hsv.v) * h) + 'px';
		// Inputs
		this.hueInput.value = Math.round(this.hsv.h);
		var rgb = hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v);
		var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
		this.hexInput.value = hex;
		this.rInput.value = Math.round(rgb.r);
		this.gInput.value = Math.round(rgb.g);
		this.bInput.value = Math.round(rgb.b);
	};

	ColorPicker.prototype._emit = function () {
		var rgb = hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v);
		var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
		if (this.activeChip && this.onChange) {
			this.onChange(this.activeChip, hex);
		}
	};

	ColorPicker.prototype._bindEvents = function () {
		var self = this;

		// SV pointer
		function onSvMove(clientX, clientY) {
			var rect = self.sv.getBoundingClientRect();
			var x = clamp(clientX - rect.left, 0, rect.width);
			var y = clamp(clientY - rect.top, 0, rect.height);
			self.hsv.s = rect.width > 0 ? x / rect.width : 0;
			self.hsv.v = rect.height > 0 ? 1 - (y / rect.height) : 0;
			self._syncUI();
			self._emit();
		}
		var svDragging = false;
		self.sv.addEventListener('mousedown', function (e) {
			svDragging = true;
			onSvMove(e.clientX, e.clientY);
			e.preventDefault();
		});
		document.addEventListener('mousemove', function (e) {
			if (svDragging) onSvMove(e.clientX, e.clientY);
		});
		document.addEventListener('mouseup', function () { svDragging = false; });
		// Touch
		self.sv.addEventListener('touchstart', function (e) {
			if (e.touches[0]) onSvMove(e.touches[0].clientX, e.touches[0].clientY);
		}, { passive: true });
		self.sv.addEventListener('touchmove', function (e) {
			if (e.touches[0]) onSvMove(e.touches[0].clientX, e.touches[0].clientY);
		}, { passive: true });

		// Hue slider
		self.hueInput.addEventListener('input', function () {
			self.hsv.h = parseFloat(self.hueInput.value) || 0;
			self._syncUI();
			self._emit();
		});

		// HEX field
		self.hexInput.addEventListener('change', function () {
			var hex = normalizeHex(self.hexInput.value);
			if (!hex) { self._syncUI(); return; }
			var rgb = hexToRgb(hex);
			self.hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
			self._syncUI();
			self._emit();
		});

		// R/G/B fields
		function rgbFieldHandler() {
			var r = clamp(parseInt(self.rInput.value, 10) || 0, 0, 255);
			var g = clamp(parseInt(self.gInput.value, 10) || 0, 0, 255);
			var b = clamp(parseInt(self.bInput.value, 10) || 0, 0, 255);
			self.hsv = rgbToHsv(r, g, b);
			self._syncUI();
			self._emit();
		}
		self.rInput.addEventListener('change', rgbFieldHandler);
		self.gInput.addEventListener('change', rgbFieldHandler);
		self.bInput.addEventListener('change', rgbFieldHandler);

		self.closeBtn.addEventListener('click', function () { self.close(); });
	};

	// ---------- main wrapper init ----------
	function initWrapper(wrapper) {
		if (wrapper.dataset.rtQrReady === '1') return;
		wrapper.dataset.rtQrReady = '1';

		var input = wrapper.querySelector('.rt-qr-input');
		var canvas = wrapper.querySelector('.rt-qr-canvas');
		var counter = wrapper.querySelector('.rt-qr-count');
		var downloadBtns = wrapper.querySelectorAll('.rt-qr-download');
		var clearBtn = wrapper.querySelector('.rt-qr-clear');
		var warningEl = wrapper.querySelector('.rt-qr-warning');
		var transparentInput = wrapper.querySelector('.rt-qr-transparent-input');
		var chips = wrapper.querySelectorAll('.rt-qr-chip');
		var presetBtns = wrapper.querySelectorAll('.rt-qr-preset');
		var size = parseInt(wrapper.dataset.size, 10) || 280;

		var state = {
			fg: normalizeHex(wrapper.dataset.fg) || '#000000',
			bg: normalizeHex(wrapper.dataset.bg) || '#FFFFFF',
			transparent: wrapper.dataset.transparent === '1'
		};

		if (!input || !canvas || typeof QRCode === 'undefined') {
			if (typeof QRCode === 'undefined' && window && window.console) {
				console.warn('[rt-qr] QRCode library not loaded');
			}
			return;
		}

		function setDownloadDisabled(disabled) {
			for (var i = 0; i < downloadBtns.length; i++) downloadBtns[i].disabled = disabled;
		}

		function updateChip(role, hex) {
			for (var i = 0; i < chips.length; i++) {
				if (chips[i].getAttribute('data-role') === role) {
					var sw = chips[i].querySelector('.rt-qr-chip-swatch');
					var hx = chips[i].querySelector('.rt-qr-chip-hex');
					if (sw) sw.style.backgroundColor = hex;
					if (hx) hx.textContent = hex;
				}
			}
		}

		function updateWarning() {
			var fg = state.fg;
			var bg = state.transparent ? '#FFFFFF' : state.bg;
			var ratio = contrastRatio(fg, bg);
			if (ratio < 3.0) {
				warningEl.textContent = 'Low contrast (' + ratio.toFixed(2) + ':1) - QR may be hard to scan';
			} else {
				warningEl.textContent = '';
			}
		}

		function updateCanvasBg() {
			// Visual-only: show chosen bg around the QR (or checkerboard via CSS if transparent)
			if (state.transparent) {
				canvas.style.backgroundColor = 'transparent';
			} else {
				canvas.style.backgroundColor = state.bg;
			}
		}

		function render(text) {
			if (!text) {
				canvas.innerHTML = '';
				canvas.classList.remove('is-visible');
				setDownloadDisabled(true);
				clearBtn.disabled = true;
				warningEl.textContent = '';
				return;
			}
			try {
				canvas.innerHTML = '';
				var light = state.transparent ? '#FFFFFF' : state.bg;
				new QRCode(canvas, {
					text: text,
					width: size,
					height: size,
					colorDark: state.fg,
					colorLight: light,
					correctLevel: QRCode.CorrectLevel.M
				});
				canvas.classList.add('is-visible');
				updateCanvasBg();
				setDownloadDisabled(false);
				clearBtn.disabled = false;
				updateWarning();
			} catch (err) {
				canvas.innerHTML = '';
				canvas.classList.remove('is-visible');
				setDownloadDisabled(true);
				if (window && window.console) console.error('[rt-qr]', err);
			}
		}

		var update = debounce(function () {
			var val = input.value.trim();
			counter.textContent = input.value.length;
			render(val);
		}, 120);

		input.addEventListener('input', update);

		clearBtn.addEventListener('click', function () {
			input.value = '';
			counter.textContent = '0';
			render('');
			input.focus();
		});

		// Download handlers
		for (var b = 0; b < downloadBtns.length; b++) {
			downloadBtns[b].addEventListener('click', function (e) {
				var btn = e.currentTarget;
				if (btn.disabled) return;
				var fmt = (btn.getAttribute('data-format') || 'png').toLowerCase();
				var dataUrl = extractDataUrl(canvas, fmt, state);
				if (!dataUrl) return;
				var a = document.createElement('a');
				a.href = dataUrl;
				a.download = buildFilename(input.value, fmt);
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
			});
		}

		// Transparent checkbox
		transparentInput.addEventListener('change', function () {
			state.transparent = transparentInput.checked;
			if (input.value.trim()) render(input.value.trim()); else updateCanvasBg();
		});

		// Chip click -> open picker; also tracks focused chip for presets
		var picker = new ColorPicker(wrapper, function (chip, hex) {
			var role = chip.getAttribute('data-role');
			if (role === 'fg') state.fg = hex;
			else if (role === 'bg') state.bg = hex;
			updateChip(role, hex);
			if (input.value.trim()) render(input.value.trim()); else updateCanvasBg();
			updateWarning();
		});

		var focusedChip = null;
		for (var ci = 0; ci < chips.length; ci++) {
			(function (chip) {
				chip.addEventListener('click', function () {
					// Toggle focus highlight
					for (var j = 0; j < chips.length; j++) chips[j].classList.remove('is-focused');
					chip.classList.add('is-focused');
					focusedChip = chip;
					var role = chip.getAttribute('data-role');
					var current = role === 'fg' ? state.fg : state.bg;
					picker.open(chip, current);
				});
			})(chips[ci]);
		}

		// Presets -> apply to focused chip (default: fg)
		for (var pi = 0; pi < presetBtns.length; pi++) {
			(function (pb) {
				pb.addEventListener('click', function () {
					var target = focusedChip || chips[0];
					if (!target) return;
					var hex = normalizeHex(pb.getAttribute('data-color'));
					if (!hex) return;
					var role = target.getAttribute('data-role');
					if (role === 'fg') state.fg = hex;
					else if (role === 'bg') state.bg = hex;
					updateChip(role, hex);
					if (!picker.el.hidden && picker.activeChip === target) {
						// Refresh picker UI if open on the same chip
						var rgb = hexToRgb(hex);
						picker.hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
						picker._syncUI();
					}
					if (input.value.trim()) render(input.value.trim()); else updateCanvasBg();
					updateWarning();
				});
			})(presetBtns[pi]);
		}

		// initial
		updateCanvasBg();
	}

	// ---------- export ----------
	function extractDataUrl(canvasEl, format, state) {
		var isJpeg = format === 'jpeg' || format === 'jpg';
		var c = canvasEl.querySelector('canvas');
		if (c) {
			try {
				var out = document.createElement('canvas');
				out.width = c.width;
				out.height = c.height;
				var octx = out.getContext('2d');

				if (isJpeg) {
					// Flatten onto chosen bg (or white if transparent is on).
					var jpegBg = state.transparent ? '#FFFFFF' : state.bg;
					octx.fillStyle = jpegBg;
					octx.fillRect(0, 0, out.width, out.height);
					octx.drawImage(c, 0, 0);
					return out.toDataURL('image/jpeg', 0.95);
				}

				// PNG path
				octx.drawImage(c, 0, 0);
				if (state.transparent) {
					// Replace near-background-white with alpha 0 for transparent PNG.
					try {
						var img = octx.getImageData(0, 0, out.width, out.height);
						var d = img.data;
						for (var i = 0; i < d.length; i += 4) {
							if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) {
								d[i + 3] = 0;
							}
						}
						octx.putImageData(img, 0, 0);
					} catch (err) {
						if (window && window.console) console.warn('[rt-qr] transparent PNG fallback', err);
					}
				}
				return out.toDataURL('image/png');
			} catch (e) { /* fallthrough */ }
		}
		var imgEl = canvasEl.querySelector('img');
		if (imgEl && imgEl.src) return imgEl.src;
		return null;
	}

	function buildFilename(text, format) {
		var ext = format === 'jpeg' || format === 'jpg' ? 'jpg' : 'png';
		var base = (text || 'qr-code').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 32);
		if (!base) base = 'qr-code';
		return base + '.' + ext;
	}

	function boot() {
		var nodes = document.querySelectorAll('.rt-qr-wrapper');
		for (var i = 0; i < nodes.length; i++) initWrapper(nodes[i]);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();
