# Roller Coaster XR - 技術規格與架構文件 (Technical Specifications)

## 1. 專案概述 (Project Overview)
本專案為一個基於網頁的 3D 沉浸式雲霄飛車體驗遊戲。同時支援**桌面/手機網頁版 (Web 3D)** 以及**頭戴式裝置虛擬實境 (WebXR)**。特色包含程式化生成的軌道 (Procedural Generation)、動態天氣/日夜循環、分數收集機制，以及單機雙人分割畫面 (Split-screen) 模式。

## 2. 核心技術棧 (Core Technology Stack)
*   **3D 渲染引擎**: [Three.js](https://threejs.org/) (依賴 ESM Import Maps，無須 Webpack/Vite 即可原生執行)。
*   **虛擬實境支援**: WebXR Device API（透過 `VRButton.js` 掛載）。
*   **介面系統**: HTML5 DOM (Web 2D) + HTML Canvas as Texture (VR 3D HUD)。
*   **音效處理**: Web Audio API (引擎聲頻率變化、立體聲音場)。
*   **開發與部署**: 靜態檔案結構搭配任意 HTTP 伺服器 (如 Python `http.server`)、GitHub Pages 發布。

---

## 3. 目錄結構與資源 (Directory Structure)
```text
roller-coaster/
├── index.html            // 網頁主程式切入點
├── main.js               // 核心渲染與生命週期管理
├── css/
│   └── style.css         // DOM 使用者介面樣式
├── js/
│   ├── config.js         // 靜態常數、場景主題(Themes)、時間設定
│   ├── state.js          // 全域狀態管理 (State Management)
│   ├── trackGenerator.js // 軌道、環境模型與物理數學生成
│   ├── input.js          // 鍵盤與 XR 搖桿輸入監聽
│   ├── ui.js             // HTML DOM 介面更新邏輯
│   ├── vrHud.js          // 專為 VR 設計的 3D Canvas 儀表板
│   ├── textures.js       // 程式化生成紋理 (Procedural Textures)
│   └── audio.js          // 背景音樂與音效管理器
└── assets/               // 多媒體資源庫 (由 / 根目錄移入)
    ├── audio/            // MP3/WAV 音效與配樂
    └── textures/         // 360度全景天空盒圖檔 (.jpg)
```

---

## 4. 系統模組架構 (Architecture Components)

### 4.1 生命週期與渲染迴圈 (Lifecycle & Loop - `main.js`)
*   **初始化**: 建立 `THREE.WebGLRenderer`、配置渲染器參數 (ReinhardToneMapping, 陰影)。
*   **場景劃分**: 
    1. 主遊戲場景 (`scene`)
    2. 主選單展示場景 (`showcaseScene` - 獨立相機，防止與主場景干擾)
*   **動畫迴圈 (`animate()`)**: 
    - 處理物理運動 (`p.rideProgress += speed * delta`)
    - 呼叫粒子更新 (`updateParticles`)、NPC 更新 (`updateNPCs`)
    - 處理相機隨軌道位移與旋轉 (`updateCameraRig`)。

### 4.2 程式化生成系統 (Procedural Generation - `trackGenerator.js`)
*   **軌道曲線 (`THREE.CatmullRomCurve3`)**: 使用隨機控制點建立封閉式的 3D Spline，並計算出所有的法向量 (Normals) 與副法向量 (Binormals) 提供給相機。
*   **環境生成**:
    - **地貌**: 利用 Sin/Cos 波形演算法生成起伏的 `PlaneGeometry`。
    - **物件佈置**: 隨機在軌道兩側放置特效金幣 (Coins)、加速圈 (Boost Rings) 及環境裝飾 (樹、岩石)。

### 4.3 介面雙軌機制 (Dual UI System)
*   **Web 2D 介面 (`ui.js`)**:
    使用傳統 HTML DOM (如 `document.getElementById`) 實作主選單、雙人遊戲分割畫面的左右儀表板，以及全螢幕的過場動畫。
*   **XR 3D 介面 (`vrHud.js`)**:
    由於進入 WebXR 後無法看見瀏覽器 HTML，系統會建立一個離屏的 `<canvas>`，將文字繪製在上面後轉為 `THREE.CanvasTexture`，最終貼在一個綁定在玩家頭上的 `THREE.Mesh`，實現沉浸式浮空儀表板。

### 4.4 狀態管理 (`state.js`)
*   集中管理所有遊戲參數：包含當前玩家清單 (`State.players`)、NPC 資料、金幣狀態、天氣 (`State.currentWeather`)，避免模組間的循環依賴 (Circular Dependency) 問題。

---

## 5. 跨平台相容性 (Cross-Platform)

1.  **單機雙人模式 (Split Screen)**:
    在非 VR 狀態下，`index.html` 內的畫面劃分為左右兩個 viewport，配置兩台 `PerspectiveCamera` 分別跟蹤 Player 1 與 Player 2。
2.  **HTC VIVE XR 模式 (VR Mode)**:
    進入 WebXR 時，關閉分割畫面，將主相機綁定至 XR 控制器內，並調用 `updateVrHud`，提供原生的雙眼渲染與 6-DOF (六自由度) 體驗。

## 6. 改進潛力與擴充建議 (Future Possibilities)
*   音效可嘗試導入 **Three.PositionalAudio** 以實現真實的 3D 空間音效 (Spatial Audio)。

## 7. 架構升級計畫 (Upcoming Architectural Upgrades)
為了支援更精緻的美術表現與一致的跨平台體驗 (Web & VR)，系統即將導入以下兩項架構升級：

### 7.1 外部 3D 模型支援 (External 3D Assets Pipeline)
摒棄純程式生成的基礎幾何體，改採資料驅動 (Data-Driven) 的模型載入系統：
*   **格式標準化**：全面採用 `.GLB` 作為標準模型格式 (支援從 Blender, 3ds Max 或是 AI 3D 產出工具匯出)。
*   **非同步載入系統**：於專案中實作 `THREE.GLTFLoader`，統一載入位於 `assets/models/` 下的靜態資源。
*   **效能優化 (Instancing)**：對於軌道周圍數量龐大的環境物件 (如幾百棵櫻花樹)，將於載入後採用 `THREE.InstancedMesh` 繪製，確保沉浸式體驗能穩定維持高 FPS。

### 7.2 跨平台 3D UI 引擎 (Unified 3D UI Engine)
為了解決傳統 HTML DOM 無法在 VR 中直接互動的痛點，系統選定 **`three-mesh-ui`** 進行介面重構。
*   **實作方法**：宣告 3D 空間中的區塊 (Block) 與字體 (Text)，並利用類似 CSS Flexbox 的排版邏輯設計懸浮的科技面板。
*   **統一互動**：
    *   電腦 Web 端：配置 `THREE.Raycaster` 捕捉滑鼠的 `pointermove` 與 `pointerdown` 事件觸發。
    *   VR 頭戴端：利用手把的雷射射線結合 `select` 事件觸發同一個按鈕。
    *   如此即可只維護一套 UI，完美對應普通螢幕與虛擬實境空間。
