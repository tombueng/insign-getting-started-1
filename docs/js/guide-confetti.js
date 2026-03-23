'use strict';

/* ==========================================================================
   Getting Started Guide - Confetti State & Animation
   ========================================================================== */

function isConfettiEnabled() {
    var match = document.cookie.split(';').find(function (c) {
        return c.trim().indexOf('insign_confetti=') === 0;
    });
    // Default: enabled (no cookie or cookie=on)
    if (!match) return true;
    return match.trim().split('=')[1] !== 'off';
}

function setConfettiEnabled(on) {
    document.cookie = 'insign_confetti=' + (on ? 'on' : 'off') + '; max-age=' + (60 * 60 * 24 * 365) + '; path=/; SameSite=Lax';
    // Sync all toggle checkboxes on the page
    document.querySelectorAll('.confetti-toggle input').forEach(function (cb) { cb.checked = on; });
}

function toggleConfetti(cb) {
    setConfettiEnabled(cb.checked);
    if (cb.checked) launchConfetti();
}

/* ==========================================================================
   CONFETTI CANNON - realistic ribbon/circle particles with shimmer
   ========================================================================== */

var confettiAnimId = null;

function launchConfetti(multiplier) {
    var mul = multiplier || 1;
    var canvas = document.getElementById('confetti-canvas');
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var W = canvas.width, H = canvas.height;

    // Cancel any running animation
    if (confettiAnimId) cancelAnimationFrame(confettiAnimId);

    var pieces = [];
    var colors = [
        { h: '#ff4757', s: '#ff6b81' }, // red
        { h: '#ffd93d', s: '#fff56d' }, // gold
        { h: '#2ed573', s: '#7bed9f' }, // green
        { h: '#1e90ff', s: '#70a1ff' }, // blue
        { h: '#ff6b6b', s: '#ff9f9f' }, // coral
        { h: '#a55eea', s: '#d2b4ff' }, // purple
        { h: '#ff9f43', s: '#ffc873' }, // orange
        { h: '#00d2d3', s: '#55efc4' }, // teal
        { h: '#f368e0', s: '#ff9ff3' }  // pink
    ];

    // Shapes: 0=ribbon, 1=circle, 2=star, 3=streamer
    var count = Math.round(500 * mul);

    // Two cannons: bottom-left and bottom-right
    var cannons = [
        { x: W * 0.15, y: H + 20, angle: -75, spread: 30 },
        { x: W * 0.85, y: H + 20, angle: -105, spread: 30 }
    ];

    for (var i = 0; i < count; i++) {
        var cannon = cannons[i % cannons.length];
        var a = (cannon.angle + (Math.random() - 0.5) * cannon.spread) * Math.PI / 180;
        var speed = 18 + Math.random() * 14;
        var col = colors[Math.floor(Math.random() * colors.length)];
        var shape = Math.random();
        var shapeType = shape < 0.4 ? 0 : shape < 0.7 ? 1 : shape < 0.85 ? 2 : 3;

        // Size variety: mix of tiny (0.3x), normal, and large (2x) pieces
        var sizeRoll = Math.random();
        var sizeMul = sizeRoll < 0.25 ? (0.3 + Math.random() * 0.3) : sizeRoll < 0.75 ? 1 : (1.5 + Math.random() * 1);

        pieces.push({
            x: cannon.x + (Math.random() - 0.5) * 30,
            y: cannon.y,
            vx: Math.cos(a) * speed + (Math.random() - 0.5) * 3,
            vy: Math.sin(a) * speed + (Math.random() - 0.5) * 2,
            w: (shapeType === 3 ? (Math.random() * 3 + 1.5) : (Math.random() * 10 + 6)) * sizeMul,
            h: (shapeType === 3 ? (Math.random() * 30 + 20) : (Math.random() * 7 + 4)) * sizeMul,
            color: col.h,
            shine: col.s,
            shape: shapeType,
            rot: Math.random() * 360,
            rotV: (Math.random() - 0.5) * 15,
            tiltAngle: Math.random() * Math.PI * 2,
            tiltSpeed: 0.03 + Math.random() * 0.06,
            opacity: 1,
            drag: 0.98 + Math.random() * 0.015,
            shimmerPhase: Math.random() * Math.PI * 2,
            shimmerSpeed: 3 + Math.random() * 4,
            scale: 0.7 + Math.random() * 0.6
        });
    }

    // Balloons: 20 floating balloons in every celebration
    {
        var balloonColors = ['#ff4757', '#ffd93d', '#2ed573', '#1e90ff', '#a55eea', '#ff6b6b', '#ff9f43', '#f368e0', '#00d2d3'];
        for (var b = 0; b < 20; b++) {
            var bc = balloonColors[b % balloonColors.length];
            pieces.push({
                x: Math.random() * W,
                y: H + 40 + Math.random() * 200,
                vx: (Math.random() - 0.5) * 1.5,
                vy: -(2.5 + Math.random() * 2),
                w: 18 + Math.random() * 10,
                h: 22 + Math.random() * 12,
                color: bc,
                shine: bc,
                shape: 4, // balloon
                rot: 0,
                rotV: (Math.random() - 0.5) * 2,
                tiltAngle: Math.random() * Math.PI * 2,
                tiltSpeed: 0.015 + Math.random() * 0.02,
                opacity: 1,
                drag: 0.998,
                shimmerPhase: Math.random() * Math.PI * 2,
                shimmerSpeed: 2 + Math.random() * 2,
                scale: 0.8 + Math.random() * 0.4,
                isBalloon: true
            });
        }
    }

    var startTime = Date.now();
    var duration = Math.round(4500 * Math.min(mul, 3));

    function draw() {
        var elapsed = Date.now() - startTime;
        if (elapsed > duration) {
            ctx.clearRect(0, 0, W, H);
            confettiAnimId = null;
            return;
        }

        ctx.clearRect(0, 0, W, H);
        var t = elapsed / 1000;
        var fadeStart = duration * 0.65;

        for (var i = 0; i < pieces.length; i++) {
            var p = pieces[i];

            // Physics
            p.vx *= p.drag;
            p.vy *= p.drag;
            if (p.isBalloon) {
                p.vy -= 0.02; // balloons float up gently
                p.vx += Math.sin(p.tiltAngle) * 0.3; // more sway
            } else {
                p.vy += 0.25; // gravity
            }
            p.vx += Math.sin(p.tiltAngle) * 0.15; // wind sway
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.rotV;
            p.tiltAngle += p.tiltSpeed;

            // Shimmer: oscillating brightness
            var shimmer = 0.6 + 0.4 * Math.sin(t * p.shimmerSpeed + p.shimmerPhase);

            // Fade out
            if (elapsed > fadeStart) {
                p.opacity = Math.max(0, 1 - (elapsed - fadeStart) / (duration - fadeStart));
            }

            // 3D tumble effect: scale X based on tilt to fake rotation
            var tiltX = Math.cos(p.tiltAngle);
            var absT = Math.abs(tiltX);

            ctx.save();
            ctx.translate(p.x, p.y);
            if (p.isBalloon) {
                // Balloons: gentle sway only, no spin or flatten
                var sway = Math.sin(p.tiltAngle) * 0.15;
                ctx.rotate(sway);
                ctx.scale(p.scale, p.scale);
            } else {
                ctx.rotate(p.rot * Math.PI / 180);
                ctx.scale(tiltX * p.scale, p.scale);
            }
            ctx.globalAlpha = p.opacity;

            var w = p.w, h = p.h;

            if (p.shape === 0) {
                // Ribbon: rounded rect with shimmer highlight
                var r = Math.min(w, h) * 0.3;
                ctx.beginPath();
                ctx.moveTo(-w/2 + r, -h/2);
                ctx.lineTo(w/2 - r, -h/2);
                ctx.quadraticCurveTo(w/2, -h/2, w/2, -h/2 + r);
                ctx.lineTo(w/2, h/2 - r);
                ctx.quadraticCurveTo(w/2, h/2, w/2 - r, h/2);
                ctx.lineTo(-w/2 + r, h/2);
                ctx.quadraticCurveTo(-w/2, h/2, -w/2, h/2 - r);
                ctx.lineTo(-w/2, -h/2 + r);
                ctx.quadraticCurveTo(-w/2, -h/2, -w/2 + r, -h/2);
                ctx.closePath();
                ctx.fillStyle = p.color;
                ctx.fill();
                // Shimmer stripe
                ctx.globalAlpha = p.opacity * shimmer * 0.5;
                ctx.fillStyle = p.shine;
                ctx.fillRect(-w/4, -h/2, w/2, h);

            } else if (p.shape === 1) {
                // Circle with specular highlight
                var rad = Math.min(w, h) * 0.45;
                ctx.beginPath();
                ctx.arc(0, 0, rad, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
                // Specular dot
                ctx.globalAlpha = p.opacity * shimmer * 0.7;
                ctx.beginPath();
                ctx.arc(-rad * 0.25, -rad * 0.25, rad * 0.35, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();

            } else if (p.shape === 2) {
                // 4-point star
                ctx.beginPath();
                var s = Math.min(w, h) * 0.5;
                for (var j = 0; j < 8; j++) {
                    var sa = (j * Math.PI) / 4;
                    var sr = j % 2 === 0 ? s : s * 0.4;
                    ctx.lineTo(Math.cos(sa) * sr, Math.sin(sa) * sr);
                }
                ctx.closePath();
                ctx.fillStyle = p.color;
                ctx.fill();
                ctx.globalAlpha = p.opacity * shimmer * 0.6;
                ctx.fillStyle = p.shine;
                ctx.fill();

            } else if (p.shape === 3) {
                // Streamer: long thin wavy strip
                ctx.beginPath();
                ctx.moveTo(0, -h/2);
                var segs = 6;
                for (var k = 0; k <= segs; k++) {
                    var sy = -h/2 + (h * k / segs);
                    var sx = Math.sin(k * 1.2 + t * 5 + p.shimmerPhase) * w;
                    ctx.lineTo(sx, sy);
                }
                ctx.strokeStyle = p.color;
                ctx.lineWidth = Math.max(1.5, w * 0.5 * absT);
                ctx.lineCap = 'round';
                ctx.stroke();

            } else {
                // Balloon: oval body + knot + wavy string
                var bw = w * 0.5, bh = h * 0.55;
                ctx.beginPath();
                ctx.ellipse(0, 0, bw, bh, 0, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
                // Specular highlight
                ctx.globalAlpha = p.opacity * shimmer * 0.45;
                ctx.beginPath();
                ctx.ellipse(-bw * 0.3, -bh * 0.35, bw * 0.3, bh * 0.25, -0.4, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
                // Knot
                ctx.globalAlpha = p.opacity;
                ctx.beginPath();
                ctx.moveTo(-2, bh);
                ctx.lineTo(0, bh + 4);
                ctx.lineTo(2, bh);
                ctx.fillStyle = p.color;
                ctx.fill();
                // Wavy string
                ctx.beginPath();
                ctx.moveTo(0, bh + 4);
                var strLen = h * 0.8;
                for (var ks = 0; ks <= 8; ks++) {
                    var ssy = bh + 4 + (strLen * ks / 8);
                    var ssx = Math.sin(ks * 0.9 + t * 3 + p.shimmerPhase) * 3;
                    ctx.lineTo(ssx, ssy);
                }
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }

            ctx.restore();
        }

        confettiAnimId = requestAnimationFrame(draw);
    }
    confettiAnimId = requestAnimationFrame(draw);
}
