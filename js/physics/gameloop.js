import { init, clear, drawBg, circle, line, rope, img, loadImg, getSize, swipeSlash, bubble, candy as drawCandy, screenToVirtual } from './renderer.js';
import { frogIdleAnimatedSpriteCoords,
        frogAskingForFoodAnimatedSpriteCoords,
        frogEatingAnimatedSpriteCoords } from '../objects/frog.js';
import { AnimatedSprite, ANimationPlayer as AnimationPlayer } from '../objects/animation.js';
import { gravity, move, ropeLimit, slow , bubbleLift } from './physics.js';
import { absToRelX, absToRelY } from './coords.js';
import { setGameObjects, recalculatePositions } from './resize.js';
import { checkForCollsions } from './collisions.js';
let running = false;
let paused = false;
let frameId = null;
let lastT = 0;

let candy = null;
let ropes = [];
let starsRel = [];
let frog = null;
let bubbles = [];
let attachedBubble = null;

let starImg = null;
let frogImg = null;
let frogAnimationPlayer = new AnimationPlayer();
// Swipe tracking for cutting
let swipePath = [];
let isDrawing = false;

let isCandyEaten = false;
// ═══════════════════════════════════════════════════════
// 1. SETUP - reads level data and positions objects
// ═══════════════════════════════════════════════════════
function setup(levelData = null) {

    if (!levelData) {
        levelData = {
            ropes: [
                { anchorX: 0.25, anchorY: 0.074, lenRel: 0.185 },   // Left - PRIMARY (straight)
                { anchorX: 0.45, anchorY: 0.056, lenRel: 0.417 },   // Center - curved
                { anchorX: 0.65, anchorY: 0.056, lenRel: 0.556 }    // Right - curved
            ],
            stars: [
                { x: 0.30, y: 0.50 },
                { x: 0.55, y: 0.40 }
            ],
            frog: { x: 0.5, y: 0.93, r: 50 }
        };
    }

    // First, find the primary rope (shortest defined, or first)
    const primary = levelData.ropes[0];
    // ropes, candy ,stars and frog absoluteX and y will calculated by recalculatePositions
    ropes = levelData.ropes.map(r => ({
        anchorRx: r.anchorX,
        anchorRy: r.anchorY,
        lenRel: r.lenRel,
        anchor: { x: 0, y: 0 },
        len: 0,
        cut: false
    }));

    candy = {
        rx: levelData.candy?.x ?? primary.anchorX,
        ry: levelData.candy?.y ?? (primary.anchorY + primary.lenRel),
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 25
    };

    starsRel = levelData.stars.map(s => ({
        rx: s.x,
        ry: s.y,
        x: 0,
        y: 0,
        r: 15,
        got: false
    }));

    frog = {
        rx: levelData.frog.x,
        ry: levelData.frog.y,
        x: 0,  
        y: 0,
        r: levelData.frog.r
    };

    bubbles = levelData.bubbles ? levelData.bubbles.map(b => ({
        rx: b.x,
        ry: b.y,
        x: 0,
        y: 0,
        r: b.r || 45,
        popped: false
    })) : [];

    attachedBubble = null;
    isCandyEaten = false;
    frogAnimationPlayer.play('idle');

    swipePath = [];

    setGameObjects(candy, ropes, starsRel, frog, bubbles);
    recalculatePositions();
}

// ═══════════════════════════════════════════════════════
// 2. APPLY CONSTRAINTS - physics for all ropes
// ═══════════════════════════════════════════════════════
function update(dt) {
    if (!candy) return;

    // Check if all ropes are cut
    const allCut = ropes.every(r => r.cut);

    if (attachedBubble && !attachedBubble.popped) {
        bubbleLift(candy, dt);
        candy.vx *= 0.99;
    }
    else {
        gravity(candy, dt);
    }

    move(candy, dt);
    moveBubbleWithCandy();

    
    const collisionResult = checkForCollsions(candy, starsRel, frog, bubbles);

    if (!isCandyEaten && collisionResult.frogHit) {
        frogAnimationPlayer.play("eating");
        isCandyEaten = true;
        if(attachedBubble)
            attachedBubble.popped = true;
        setTimeout(() => {
            endGame(true);   // WIN
        }, 1000);
        return;
    }
    
    if (!isCandyEaten && isCandyLost()) {
        endGame(false);  // OOPS
        return;
    }

    if (!attachedBubble && collisionResult.bubbleHit) {
        attachedBubble = collisionResult.bubbleHit;
        candy.vy *= 0.60; // TODO: check if it looks smooth
    }

    // Only apply rope constraints if not all cut
    if (!allCut) {
        ropes.forEach(rope => {
            if (!rope.cut) {
                ropeLimit(candy, rope.anchor, rope.len);
            }
        });
    }

    slow(candy);

    // syncing relative coordinates after physics calculations
    const { w, h } = getSize();
    candy.rx = absToRelX(candy.x, w);
    candy.ry = absToRelY(candy.y, h);

    frogAnimationPlayer.update(dt);
}

// ═══════════════════════════════════════════════════════
// 3. CUT ROPE - checks if swipe line crosses rope
// ═══════════════════════════════════════════════════════
function checkSwipeCuts() {
    if (swipePath.length < 2) return;

    // Get last two points of swipe
    const p1 = swipePath[swipePath.length - 2];
    const p2 = swipePath[swipePath.length - 1];

    ropes.forEach(rope => {
        if (!rope.cut && candy) {
            // Check if swipe line intersects with rope line
            if (linesIntersect(
                p1.x, p1.y, p2.x, p2.y,
                rope.anchor.x, rope.anchor.y, candy.x, candy.y
            )) {
                rope.cut = true;
                console.log('Rope cut!');
                let e = new CustomEvent("RopeCut", {detail: {
                    rope: rope
                }});
                window.dispatchEvent(e);
            }
        }
    });
}

// ═══════════════════════════════════════════════════════
// 4. LINE INTERSECTION - checks if two lines cross
// ═══════════════════════════════════════════════════════
function linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    // Calculate direction of lines
    const d1 = direction(x3, y3, x4, y4, x1, y1);
    const d2 = direction(x3, y3, x4, y4, x2, y2);
    const d3 = direction(x1, y1, x2, y2, x3, y3);
    const d4 = direction(x1, y1, x2, y2, x4, y4);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
    }

    // Check for collinear cases
    if (d1 === 0 && onSegment(x3, y3, x4, y4, x1, y1)) return true;
    if (d2 === 0 && onSegment(x3, y3, x4, y4, x2, y2)) return true;
    if (d3 === 0 && onSegment(x1, y1, x2, y2, x3, y3)) return true;
    if (d4 === 0 && onSegment(x1, y1, x2, y2, x4, y4)) return true;

    return false;
}

function direction(ax, ay, bx, by, cx, cy) {
    return (cx - ax) * (by - ay) - (cy - ay) * (bx - ax);
}

function onSegment(ax, ay, bx, by, cx, cy) {
    return cx >= Math.min(ax, bx) && cx <= Math.max(ax, bx) &&
        cy >= Math.min(ay, by) && cy <= Math.max(ay, by);
}

// ═══════════════════════════════════════════════════════
// DRAW - render everything
// ═══════════════════════════════════════════════════════
function draw() {
    clear();
    drawBg('#00000000');

    // Draw ropes
    ropes.forEach(r => {
        circle(r.anchor.x, r.anchor.y, 12, '#2d6a8a');  // outer dark blue
        circle(r.anchor.x, r.anchor.y, 8, '#5bb8d9');   // inner light blue
        circle(r.anchor.x, r.anchor.y, 2, '#ffffffff');   // small black center
        if (!r.cut) {
            const sag = Math.min(r.len * 0.5, 80);
            rope(r.anchor.x, r.anchor.y, candy.x, candy.y, sag, '#8B4513', 4);
        }
    });

    // Draw candy
    if (candy && !isCandyEaten ) {
        drawCandy(candy.x, candy.y, candy.r);
    }

    // Draw stars
    starsRel.forEach(s => {
        if (!s.got) {
            if (starImg) {
                img(starImg, s.x, s.y, 40, 40);
            } else {
                circle(s.x, s.y, s.r, '#FFD700');
            }
        }
    });

    // Draw bubbles
    bubbles.forEach(b => {
        if (!b.popped) {
            bubble(b.x, b.y, b.r);
        }
    });

    // Draw frog
    if (frogImg) {
        // img(frogImg, frog.x, frog.y, frog.r * 2.4, frog.r * 2.4);
        frogAnimationPlayer.draw(frog.x, frog.y, frog.r * 2.1, frog.r * 2.1);
    } else {
        circle(frog.x, frog.y, frog.r, '#4CAF50');
    }

    // Draw swipe slash (golden glow like real game)
    if (isDrawing && swipePath.length > 1) {
        swipeSlash(swipePath);
    }
}

// ═══════════════════════════════════════════════════════
// GAME LOOP
// ═══════════════════════════════════════════════════════
function loop(t) {
    if (!running) return;

    const dt = Math.min((t - lastT) / 1000, 0.1);
    lastT = t;

    if (!paused) update(dt);
    draw();
    frameId = requestAnimationFrame(loop);
}

export async function start(levelData) {
    if (running) return;

    // Wait for DOM to be fully ready
    if (document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve));
    }

    if (!init()) {
        console.error('Canvas failed');
        return;
    }

    try { starImg = await loadImg('./images/star_result_small.png'); } catch (e) { }
    try { frogImg = await loadImg('./images/pin-omnom.png'); } catch (e) { }


    let frogIdleAnimatedSprite = await AnimatedSprite.create("./images/char_animations2.png", frogIdleAnimatedSpriteCoords, 15, true)
    let frogEatingAnimatedSprite = await AnimatedSprite.create("./images/char_animations.png", frogEatingAnimatedSpriteCoords, 30, false)

    frogAnimationPlayer.animations['idle'] = frogIdleAnimatedSprite;
    frogAnimationPlayer.defaultAnimation = 'idle';
    frogAnimationPlayer.animations['eating'] = frogEatingAnimatedSprite;
    frogAnimationPlayer.play('idle');
    // Wait for next animation frame AND ensure canvas has size
    const waitForCanvas = () => {
        return new Promise(resolve => {
            const check = () => {
                const { w, h } = getSize();
                if (w > 0 && h > 0) {
                    resolve();
                } else {
                    requestAnimationFrame(check);
                }
            };
            requestAnimationFrame(check);
        });
    };

    await waitForCanvas();

    setup(levelData);
    running = true;
    paused = false;
    lastT = performance.now();
    frameId = requestAnimationFrame(loop);
    isCandyEaten = false;
    applyOrientationLock(); // pause immediately if started in portrait
    const canvas = document.getElementById('game-canvas');

    canvas.addEventListener('mousedown', (e) => {
        const p = screenToVirtual(e.clientX, e.clientY);
        checkForBubblePopOnClick(p.x, p.y);
        isDrawing = true;
        swipePath = [{ x: p.x, y: p.y }];
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDrawing) {
            const p = screenToVirtual(e.clientX, e.clientY);
            swipePath.push({ x: p.x, y: p.y });
            // Keep path short for performance
            if (swipePath.length > 20) swipePath.shift();
            checkSwipeCuts();
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDrawing = false;
        swipePath = [];
    });

    canvas.addEventListener('mouseleave', () => {
        isDrawing = false;
        swipePath = [];
    });

    // Touch: start must arm cutting (otherwise touchmove never fires cuts on phones).
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const p = screenToVirtual(touch.clientX, touch.clientY);
        checkForBubblePopOnClick(p.x, p.y);
        isDrawing = true;
        swipePath = [{ x: p.x, y: p.y }];
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (isDrawing) {
            const touch = e.touches[0];
            const p = screenToVirtual(touch.clientX, touch.clientY);
            swipePath.push({ x: p.x, y: p.y });
            if (swipePath.length > 20) swipePath.shift();
            checkSwipeCuts();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
        isDrawing = false;
        swipePath = [];
    });
}

// Landscape lock: freeze gameplay while the portrait rotate-overlay is up,
// so the candy can't fall (and lose the level) behind it. Matches the
// same media query used in css/orientation.css.
const _portraitMq = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
function applyOrientationLock() {
    if (!running) return;
    if (_portraitMq.matches) pause();
    else resume();
}
if (_portraitMq.addEventListener) _portraitMq.addEventListener('change', applyOrientationLock);
else if (_portraitMq.addListener) _portraitMq.addListener(applyOrientationLock);

export function stop() {
    running = false;
    if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = null;
    }
}

export function pause() {
    paused = true;
}

export function resume() {
    if (paused) {
        paused = false;
        lastT = performance.now();
    }
}

function isCandyLost() {
    const { h } = getSize();
    return candy.y > h + 100 || candy.y < -100;;  // fell below screen or went too high
}

// Export for external use (Zeyad's input.js)
export function cutRopeAt(mouseX, mouseY) {
    swipePath.push({ x: mouseX, y: mouseY });
    checkSwipeCuts();
}

function checkForBubblePopOnClick(clickedX, clickedY) {
    if (attachedBubble && !attachedBubble.popped) {
        const dx = attachedBubble.x - clickedX;
        const dy = attachedBubble.y - clickedY;
        const distSq = dx * dx + dy * dy;
        if (distSq < attachedBubble.r * attachedBubble.r) {
            attachedBubble.popped = true;
            attachedBubble = null;
        }
    }
}

function moveBubbleWithCandy() {
    if (attachedBubble && !attachedBubble.popped) {
        attachedBubble.x = candy.x;
        attachedBubble.y = candy.y;
    }
}

function endGame(won) {
    stop();
    const starsCollected = starsRel.filter(s => s.got).length;
    
    console.log(won ? "WIN!" : "OOPS!");
    console.log("Stars:", starsCollected);
    
    // TODO: show result screen with starsCollected
    const event = new CustomEvent("EndLevel", {
        detail: {won, starsCollected}
    })
    window.dispatchEvent(event);
}

