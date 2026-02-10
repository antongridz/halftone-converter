
export class HalftoneEngine {
    constructor(canvases) {
        this.sourceCanvas = canvases.source;
        this.halftoneCanvas = canvases.halftone;
        this.beforeCanvas = canvases.before; // Can be null if not used directly
        this.afterCanvas = canvases.after;   // Can be null if not used directly
        this.glCanvas = document.createElement('canvas'); // Offscreen for WebGL processing

        this.sourceCtx = this.sourceCanvas.getContext('2d');
        this.halftoneCtx = this.halftoneCanvas.getContext('2d');

        this.gl = null;
        this.program = null;
        this.sourceTexture = null;

        this.initWebGL();
    }

    initWebGL() {
        // Try getting WebGL context from the offscreen canvas
        this.gl = this.glCanvas.getContext('webgl', { preserveDrawingBuffer: true }) ||
            this.glCanvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });

        if (!this.gl) {
            console.warn('WebGL not supported');
            return;
        }

        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        const fragmentShaderSource = `
            precision highp float;
            
            uniform sampler2D u_image;
            uniform vec2 u_resolution;
            uniform float u_frequency;
            uniform float u_dotSize;
            uniform float u_angle;
            uniform int u_pattern;
            uniform vec3 u_color;
            uniform int u_channel;
            
            varying vec2 v_texCoord;
            
            #define PI 3.14159265359
            
            mat2 rotate2d(float angle) {
                float s = sin(angle);
                float c = cos(angle);
                return mat2(c, -s, s, c);
            }
            
            vec4 rgb2cmyk(vec3 rgb) {
                float k = 1.0 - max(max(rgb.r, rgb.g), rgb.b);
                if (k >= 0.9999) return vec4(0.0, 0.0, 0.0, 1.0);
                float invK = 1.0 / (1.0 - k);
                float c = (1.0 - rgb.r - k) * invK;
                float m = (1.0 - rgb.g - k) * invK;
                float y = (1.0 - rgb.b - k) * invK;
                return vec4(clamp(c, 0.0, 1.0), clamp(m, 0.0, 1.0), clamp(y, 0.0, 1.0), k);
            }
            
            float getChannel(vec4 cmyk, int ch) {
                if (ch == 0) return cmyk.x;
                if (ch == 1) return cmyk.y;
                if (ch == 2) return cmyk.z;
                return cmyk.w;
            }
            
            float halftone(vec2 uv, float value, float freq, float size, float angle, int pattern) {
                float cellSize = u_resolution.x / freq;
                vec2 center = u_resolution * 0.5;
                vec2 pos = uv * u_resolution - center;
                pos = rotate2d(angle * PI / 180.0) * pos;
                pos += center;
                
                vec2 cell = floor(pos / cellSize);
                vec2 cellCenter = (cell + 0.5) * cellSize;
                vec2 cellUV = (pos - cellCenter) / cellSize;
                
                float radius = sqrt(value) * 0.5 * (size / 100.0);
                
                float d;
                if (pattern == 0) { // Circle
                    d = length(cellUV);
                } else if (pattern == 1) { // Square
                    d = max(abs(cellUV.x), abs(cellUV.y));
                } else if (pattern == 2) { // Diamond
                    d = abs(cellUV.x) + abs(cellUV.y);
                    d *= 0.707;
                } else if (pattern == 3) { // Ellipse
                    d = length(cellUV * vec2(1.0, 1.6));
                } else if (pattern == 4) { // Lines
                    d = abs(cellUV.y);
                    radius = value * 0.45 * (size / 100.0);
                } else if (pattern == 5) { // Cross
                    d = min(abs(cellUV.x), abs(cellUV.y));
                } else if (pattern == 6) { // Star
                    float a = atan(cellUV.y, cellUV.x);
                    float r = length(cellUV);
                    d = r * (1.0 + 0.3 * cos(a * 5.0));
                } else if (pattern == 7) { // Triangle
                    vec2 p = cellUV;
                    float k = sqrt(3.0);
                    p.x = abs(p.x) - 0.5;
                    p.y = p.y + 0.5/k;
                    if(p.x + k*p.y > 0.0) p = vec2(p.x - k*p.y, -k*p.x - p.y) / 2.0;
                    p.x -= clamp(p.x, -1.0, 0.0);
                    d = -length(p) * sign(p.y);
                    d = length(cellUV) + d * 0.3;
                } else if (pattern == 8) { // Hex
                    vec2 p = abs(cellUV);
                    d = max(p.x * 0.866 + p.y * 0.5, p.y);
                } else if (pattern == 9) { // Ring
                    d = abs(length(cellUV) - 0.3);
                    radius = value * 0.2 * (size / 100.0);
                } else if (pattern == 10) { // Wave
                    d = abs(cellUV.y - sin(cellUV.x * 6.28) * 0.15);
                    radius = value * 0.35 * (size / 100.0);
                } else { // Dot grid
                    vec2 subCell = fract(cellUV * 2.0 + 0.5) - 0.5;
                    d = length(subCell) * 2.0;
                }
                
                return 1.0 - smoothstep(radius - 0.03, radius + 0.03, d);
            }
            
            void main() {
                vec4 texColor = texture2D(u_image, v_texCoord);
                vec4 cmyk = rgb2cmyk(texColor.rgb);
                float channelValue = getChannel(cmyk, u_channel);
                
                float h = halftone(v_texCoord, channelValue, u_frequency, u_dotSize, u_angle, u_pattern);
                
                gl_FragColor = vec4(u_color, h);
            }
        `;

        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Program link error:', this.gl.getProgramInfoLog(this.program));
        }

        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
        ]), this.gl.STATIC_DRAW);

        const positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);

        const texCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texCoordBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0
        ]), this.gl.STATIC_DRAW);

        const texCoordLocation = this.gl.getAttribLocation(this.program, 'a_texCoord');
        this.gl.enableVertexAttribArray(texCoordLocation);
        this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 0, 0);
    }

    compileShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    loadImage(img) {
        // img is an HTMLImageElement
        this.sourceCanvas.width = img.width;
        this.sourceCanvas.height = img.height;
        this.sourceCtx.drawImage(img, 0, 0);

        this.halftoneCanvas.width = img.width;
        this.halftoneCanvas.height = img.height;

        this.glCanvas.width = img.width;
        this.glCanvas.height = img.height;

        this.setupTexture();
        this.imageLoaded = true;
    }

    setupTexture() {
        this.gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);

        if (this.sourceTexture) this.gl.deleteTexture(this.sourceTexture);

        this.sourceTexture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.sourceCanvas);
    }

    render(settings) {
        if (!this.imageLoaded || !this.program) return;

        const width = this.sourceCanvas.width;
        const height = this.sourceCanvas.height;

        // Clear canvas
        if (settings.transparentBg) {
            this.halftoneCtx.clearRect(0, 0, width, height);
        } else {
            this.halftoneCtx.fillStyle = '#f4f1ea'; // cream color
            this.halftoneCtx.fillRect(0, 0, width, height);
        }

        if (settings.colorMode === 'cmyk') {
            this.renderCMYK(settings);
        } else if (settings.colorMode === 'mono') {
            this.renderMono(settings);
        } else {
            this.renderCustomColors(settings);
        }

        // Return the rendered canvas for preview? Or just rely on canvas update.
        // The canvas is updated in place.
    }

    getPatternIndex(patternName) {
        const patterns = ['circle', 'square', 'diamond', 'ellipse', 'line', 'cross', 'star', 'triangle', 'hex', 'ring', 'wave', 'dot-grid'];
        return patterns.indexOf(patternName);
    }

    renderCMYK(settings) {
        const channels = ['cyan', 'magenta', 'yellow', 'key'];
        const colors = {
            cyan: [0, 0.682, 0.937],
            magenta: [0.925, 0, 0.549],
            yellow: [1, 0.949, 0],
            key: [0.137, 0.122, 0.125]
        };

        channels.forEach((channel, index) => {
            const ch = settings.channels[channel];
            if (!ch.enabled) return;
            this.renderChannelGL(index, ch.angle, ch.size, ch.frequency, colors[channel], settings.pattern);
        });
    }

    renderMono(settings) {
        const ch = settings.channels.key;
        this.renderChannelGL(3, ch.angle, ch.size, ch.frequency, [0.137, 0.122, 0.125], settings.pattern);
    }

    renderCustomColors(settings) {
        const numColors = settings.colorMode === 'duotone' ? 2 : 3;
        const angles = [15, 75, 45];

        for (let i = 0; i < numColors; i++) {
            const hex = settings.customColors[i];
            const rgb = this.hexToRgb(hex);
            const ch = Object.values(settings.channels)[i];
            // Custom colors use CPU rendering in original code, but we can try to adapt to GL later.
            // Original code used renderCustomChannelCanvas (CPU). Let's implement that too.
            this.renderCustomChannelCanvas(i, numColors, angles[i], ch.size, ch.frequency, rgb, settings.pattern);
        }
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ] : [0, 0, 0];
    }

    renderChannelGL(channelIndex, angle, size, frequency, color, pattern) {
        this.gl.useProgram(this.program);

        this.gl.uniform2f(this.gl.getUniformLocation(this.program, 'u_resolution'), this.glCanvas.width, this.glCanvas.height);
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'u_frequency'), frequency);
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'u_dotSize'), size);
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'u_angle'), angle);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_pattern'), this.getPatternIndex(pattern));
        this.gl.uniform3f(this.gl.getUniformLocation(this.program, 'u_color'), color[0], color[1], color[2]);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'u_channel'), channelIndex);

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

        const pixels = new Uint8Array(this.glCanvas.width * this.glCanvas.height * 4);
        this.gl.readPixels(0, 0, this.glCanvas.width, this.glCanvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);

        // Flip Y and composite
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.glCanvas.width;
        tempCanvas.height = this.glCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        const imageData = tempCtx.createImageData(this.glCanvas.width, this.glCanvas.height);

        // Optimized loop for flipping Y
        const w = this.glCanvas.width;
        const h = this.glCanvas.height;
        for (let y = 0; y < h; y++) {
            const srcRow = y * w * 4;
            const dstRow = (h - 1 - y) * w * 4;
            // Copy row
            for (let x = 0; x < w * 4; x++) {
                imageData.data[dstRow + x] = pixels[srcRow + x];
            }
        }

        tempCtx.putImageData(imageData, 0, 0);

        this.halftoneCtx.globalCompositeOperation = 'multiply';
        this.halftoneCtx.drawImage(tempCanvas, 0, 0);
        this.halftoneCtx.globalCompositeOperation = 'source-over';
    }

    renderCustomChannelCanvas(colorIndex, totalColors, angle, size, frequency, rgb, pattern) {
        // CPU implementation from original code
        const width = this.halftoneCanvas.width;
        const height = this.halftoneCanvas.height;
        const imageData = this.sourceCtx.getImageData(0, 0, width, height).data;

        const cellSize = Math.max(2, Math.round(width / frequency));
        const angleRad = angle * Math.PI / 180;
        const diagonal = Math.sqrt(width * width + height * height);
        const centerX = width / 2;
        const centerY = height / 2;

        this.halftoneCtx.fillStyle = `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;

        // Using smaller step or just implementing the loop as is
        // NOTE: This might be slow in JS without WebGL.
        // Original code was CPU based for custom colors? Yes.

        for (let gy = -diagonal / 2; gy < diagonal / 2; gy += cellSize) {
            for (let gx = -diagonal / 2; gx < diagonal / 2; gx += cellSize) {
                const rx = gx * Math.cos(angleRad) - gy * Math.sin(angleRad) + centerX;
                const ry = gx * Math.sin(angleRad) + gy * Math.cos(angleRad) + centerY;

                if (rx < 0 || rx >= width || ry < 0 || ry >= height) continue;

                const px = Math.floor(rx);
                const py = Math.floor(ry);
                const idx = (py * width + px) * 4;

                const r = imageData[idx] / 255;
                const g = imageData[idx + 1] / 255;
                const b = imageData[idx + 2] / 255;
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;

                let intensity = 0;
                if (totalColors === 2) {
                    intensity = colorIndex === 0 ? Math.pow(1 - lum, 1.2) * 0.8 : lum * 0.6;
                } else {
                    if (colorIndex === 0) intensity = Math.max(0, (0.4 - lum) * 2.5);
                    else if (colorIndex === 1) intensity = Math.max(0, 1 - Math.abs(lum - 0.5) * 2.5);
                    else intensity = Math.max(0, (lum - 0.6) * 2.5);
                }

                if (intensity < 0.02) continue;

                const dotRadius = cellSize * 0.5 * Math.sqrt(intensity) * (size / 100);

                this.halftoneCtx.beginPath();
                this.drawPatternShape(rx, ry, dotRadius, cellSize, angleRad, pattern);
                this.halftoneCtx.fill();
            }
        }
    }

    drawPatternShape(x, y, radius, cellSize, angle, pattern) {
        const ctx = this.halftoneCtx;

        switch (pattern) {
            case 'circle':
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                break;
            case 'square':
                ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
                break;
            case 'diamond':
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.PI / 4);
                ctx.rect(-radius, -radius, radius * 2, radius * 2);
                ctx.restore();
                break;
            case 'ellipse':
                ctx.ellipse(x, y, radius, radius * 0.6, angle, 0, Math.PI * 2);
                break;
            case 'line':
                ctx.rect(x - cellSize * 0.4, y - radius * 0.3, cellSize * 0.8, radius * 0.6);
                break;
            case 'cross':
                ctx.rect(x - radius * 0.2, y - radius, radius * 0.4, radius * 2);
                ctx.rect(x - radius, y - radius * 0.2, radius * 2, radius * 0.4);
                break;
            case 'star':
                this.drawStar(ctx, x, y, 5, radius, radius * 0.5);
                break;
            case 'triangle':
                ctx.moveTo(x, y - radius);
                ctx.lineTo(x + radius * 0.866, y + radius * 0.5);
                ctx.lineTo(x - radius * 0.866, y + radius * 0.5);
                ctx.closePath();
                break;
            case 'hex':
                this.drawPolygon(ctx, x, y, radius, 6);
                break;
            case 'ring':
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2, true);
                break;
            case 'wave':
                ctx.ellipse(x, y, radius, radius * 0.3, angle, 0, Math.PI * 2);
                break;
            case 'dot-grid':
                const s = radius * 0.4;
                ctx.arc(x - s, y - s, s, 0, Math.PI * 2);
                ctx.arc(x + s, y - s, s, 0, Math.PI * 2);
                ctx.arc(x - s, y + s, s, 0, Math.PI * 2);
                ctx.arc(x + s, y + s, s, 0, Math.PI * 2);
                break;
            default:
                ctx.arc(x, y, radius, 0, Math.PI * 2);
        }
    }

    drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
        let rot = Math.PI / 2 * 3;
        let step = Math.PI / spikes;

        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
            rot += step;
            ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
    }

    drawPolygon(ctx, cx, cy, radius, sides) {
        ctx.moveTo(cx + radius * Math.cos(0), cy + radius * Math.sin(0));
        for (let i = 1; i <= sides; i++) {
            ctx.lineTo(cx + radius * Math.cos(i * 2 * Math.PI / sides), cy + radius * Math.sin(i * 2 * Math.PI / sides));
        }
        ctx.closePath();
    }

    // Export helpers
    generateSVG(settings) {
        if (!this.sourceCanvas) return '';

        const width = this.sourceCanvas.width;
        const height = this.sourceCanvas.height;
        const imageData = this.sourceCtx.getImageData(0, 0, width, height).data;

        let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;

        if (!settings.transparentBg) {
            svg += `  <rect width="${width}" height="${height}" fill="#f4f1ea"/>\n`;
        }

        // Determine channels to export
        let channels = [];
        if (settings.colorMode === 'cmyk') {
            channels = ['cyan', 'magenta', 'yellow', 'key'];
        } else if (settings.colorMode === 'mono') {
            channels = ['key'];
        } else {
            // Custom colors not fully supported in SVG export in legacy, but we can try mapping them
            // Legacy code only did CMYK/Mono for SVG loop. 
            // If custom mode, let's skip or treat as mono?
            // "The legacy code probably did something specific." 
            // Looking at legacy code:
            // const channels = this.settings.colorMode === 'cmyk' ? ['cyan'...] : this.settings.colorMode === 'mono' ? ['key'] : [];
            // So custom colors yielded empty array -> no SVG output for custom colors.
            // I will maintain this behavior for now to match legacy fidelity.
            channels = [];
        }

        const colors = { cyan: '#00aeef', magenta: '#ec008c', yellow: '#fff200', key: '#231f20' };

        channels.forEach((channel) => {
            const ch = settings.channels[channel];
            if (!ch.enabled) return;

            svg += `  <g fill="${colors[channel]}" opacity="0.85">\n`;

            const cellSize = Math.max(2, Math.round(width / ch.frequency));
            const angleRad = ch.angle * Math.PI / 180;
            const diagonal = Math.sqrt(width * width + height * height);
            const centerX = width / 2;
            const centerY = height / 2;

            // Loop for dots
            for (let gy = -diagonal / 2; gy < diagonal / 2; gy += cellSize) {
                for (let gx = -diagonal / 2; gx < diagonal / 2; gx += cellSize) {
                    const rx = gx * Math.cos(angleRad) - gy * Math.sin(angleRad) + centerX;
                    const ry = gx * Math.sin(angleRad) + gy * Math.cos(angleRad) + centerY;

                    if (rx < 0 || rx >= width || ry < 0 || ry >= height) continue;

                    const px = Math.floor(rx);
                    const py = Math.floor(ry);
                    const idx = (py * width + px) * 4;

                    const r = imageData[idx] / 255;
                    const g = imageData[idx + 1] / 255;
                    const b = imageData[idx + 2] / 255;

                    const k = 1 - Math.max(r, g, b);
                    let intensity = 0;

                    if (k < 0.999) {
                        const invK = 1 / (1 - k);
                        if (channel === 'cyan') intensity = (1 - r - k) * invK;
                        else if (channel === 'magenta') intensity = (1 - g - k) * invK;
                        else if (channel === 'yellow') intensity = (1 - b - k) * invK;
                        else intensity = k;
                    } else {
                        // Pure black
                        intensity = channel === 'key' ? 1 : 0;
                    }

                    intensity = Math.max(0, Math.min(1, intensity));
                    if (intensity < 0.02) continue;

                    const dotRadius = cellSize * 0.5 * Math.sqrt(intensity) * (ch.size / 100);
                    svg += this.getSVGShape(rx, ry, dotRadius, ch.angle, settings.pattern);
                }
            }

            svg += `  </g>\n`;
        });

        svg += '</svg>';
        return svg;
    }


    getSVGShape(x, y, r, angle, pattern) {
        const xf = x.toFixed(1);
        const yf = y.toFixed(1);
        const rf = r.toFixed(1);

        switch (pattern) {
            case 'circle':
                return `    <circle cx="${xf}" cy="${yf}" r="${rf}"/>\n`;
            case 'square':
                return `    <rect x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${(r * 2).toFixed(1)}" height="${(r * 2).toFixed(1)}"/>\n`;
            case 'diamond':
                return `    <rect x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${(r * 2).toFixed(1)}" height="${(r * 2).toFixed(1)}" transform="rotate(45 ${xf} ${yf})"/>\n`;
            case 'ellipse':
                return `    <ellipse cx="${xf}" cy="${yf}" rx="${rf}" ry="${(r * 0.6).toFixed(1)}" transform="rotate(${angle} ${xf} ${yf})"/>\n`;
            case 'hex':
                const pts = [];
                for (let i = 0; i < 6; i++) {
                    pts.push(`${(x + r * Math.cos(i * Math.PI / 3)).toFixed(1)},${(y + r * Math.sin(i * Math.PI / 3)).toFixed(1)}`);
                }
                return `    <polygon points="${pts.join(' ')}"/>\n`;
            default:
                return `    <circle cx="${xf}" cy="${yf}" r="${rf}"/>\n`;
        }
    }
}
