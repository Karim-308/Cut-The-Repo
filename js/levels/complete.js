/**
 * Complete Screen Logic
 * Handles user interaction when all levels are finished.
 */

const completeScreen = document.querySelector('.complete-screen');
const mainScreen = document.querySelector('.main-screen');

export function showCompleteScreen() {
    if (completeScreen) {
        completeScreen.style.display = 'flex';
        document.addEventListener('keydown', handleEnterKey);
        // Tap anywhere returns home — required for touch devices, which have
        // no Enter key. Listen at document level (pointerdown covers mouse +
        // touch) so nothing on top can swallow the tap.
        document.addEventListener('pointerdown', handleTap);
    }
}

export function hideCompleteScreen() {
    if (completeScreen) {
        completeScreen.style.display = 'none';
        document.removeEventListener('keydown', handleEnterKey);
        document.removeEventListener('pointerdown', handleTap);
    }
}

function returnHome() {
    const style = window.getComputedStyle(completeScreen);
    if (style.display !== 'none') {
        hideCompleteScreen();
        if (mainScreen) {
            mainScreen.style.display = 'block';
        }
    }
}

function handleEnterKey(event) {
    if (event.key === 'Enter') {
        returnHome();
    }
}

function handleTap() {
    returnHome();
}

document.addEventListener('keydown', handleEnterKey);
