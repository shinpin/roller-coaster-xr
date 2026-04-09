import * as THREE from 'three';
import ThreeMeshUI from 'three-mesh-ui';

// Maintain a list of all interactive elements so the raycaster can test against them
export const interactiveUIMeshes = [];

/**
 * Creates the 3D Floating Menu and adds it to the provided scene
 * @param {THREE.Scene} scene The scene to add the menu to (e.g. showcaseScene)
 * @returns {ThreeMeshUI.Block} The root container block
 */
export function create3DMenu(scene) {
    // 1. Create a root container block
    // We use unpkg CDN links for the default Roboto font to avoid missing local font assets.
    const container = new ThreeMeshUI.Block({
        justifyContent: 'center',
        alignContent: 'center',
        contentDirection: 'column',
        fontFamily: 'https://cdn.jsdelivr.net/npm/three-mesh-ui@7.1.5/examples/assets/Roboto-msdf.json',
        fontTexture: 'https://cdn.jsdelivr.net/npm/three-mesh-ui@7.1.5/examples/assets/Roboto-msdf.png',
        fontSize: 0.15,
        padding: 0.2,
        borderRadius: 0.1,
        backgroundOpacity: 0.8,
        backgroundColor: new THREE.Color(0x0a192f)
    });

    // Position the menu panel in the 3D space
    // Placing it slightly elevated and forward so it's easily visible in showcase mode or VR
    container.position.set(0, 1.6, -3.5); 
    container.rotation.x = -0.05;

    // 2. Add Title Text
    const title = new ThreeMeshUI.Text({
        content: 'NEON XR COASTER\n',
        fontSize: 0.3,
        fontColor: new THREE.Color(0x00f3ff)
    });
    
    // 3. Add Subtitle
    const subtitle = new ThreeMeshUI.Text({
        content: 'Virtual Reality Ready\n\n',
        fontSize: 0.1,
        fontColor: new THREE.Color(0xa0a0a0)
    });

    // 4. Create an Interactive Button
    const buttonOptions = {
        width: 1.5,
        height: 0.4,
        justifyContent: 'center',
        alignContent: 'center',
        offset: 0.05,
        margin: 0.05,
        borderRadius: 0.05
    };

    const startButton = new ThreeMeshUI.Block(buttonOptions);
    startButton.add(new ThreeMeshUI.Text({ content: 'START RIDE' }));

    // Define visual states for interaction
    const idleStateAttributes = {
        state: 'idle',
        attributes: {
            offset: 0.035,
            backgroundColor: new THREE.Color(0x112240),
            fontColor: new THREE.Color(0xffffff)
        },
    };

    const hoveredStateAttributes = {
        state: 'hovered',
        attributes: {
            offset: 0.05,
            backgroundColor: new THREE.Color(0x00f3ff),
            fontColor: new THREE.Color(0x000000)
        },
    };
    
    const selectedStateAttributes = {
        state: 'selected',
        attributes: {
            offset: 0.02,
            backgroundColor: new THREE.Color(0xff00ea),
            fontColor: new THREE.Color(0xffffff)
        },
    };

    startButton.setupState(idleStateAttributes);
    startButton.setupState(hoveredStateAttributes);
    startButton.setupState(selectedStateAttributes);
    startButton.setState('idle'); // Initial state
    
    // Custom interaction handlers attached to the button block.
    // main.js will call these when the raycaster intersects the button.
    startButton.onHover = () => { startButton.setState('hovered'); };
    startButton.onIdle = () => { startButton.setState('idle'); };
    startButton.onClick = () => { 
        startButton.setState('selected');
        // Trigger the game start via the global startGame function defined in main.js
        setTimeout(() => {
            if(window.startGame) {
                console.log("[3D Menu] Start button clicked via VR/Raycaster!");
                window.startGame();
            }
            startButton.setState('idle');
        }, 300);
    };

    // Add this button to our list of interactable UI elements
    interactiveUIMeshes.push(startButton);

    // 5. Compose the layout and add to scene
    container.add(title, subtitle, startButton);
    scene.add(container);

    return container;
}
