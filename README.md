# Roller Coaster XR (WebXR 雲霄飛車體驗專案)

## 📌 專案說明 (Project Overview)
**Roller Coaster XR** 是一個基於瀏覽器運行的 3D 沉浸式雲霄飛車體驗模擬器。

本專案同時兼顧了傳統網頁體驗與最先進的虛擬實境 (VR) 技術。您可以直接在電腦螢幕前與朋友使用「單機雙人分割畫面 (Split-screen)」同樂，或是戴上 **HTC VIVE XR Elite** 進入完全沉浸的第一人稱虛擬實境世界！

遊戲採用「程式化生成 (Procedural Generation)」技術，每一次啟動和切換場景時，系統都會依據數學曲線與隨機演算法，為您長出獨一無二的彎道、環境佈景與天氣機制。

---

## ✨ 核心特色與功能 (Core Features)
*   🥽 **無縫切換雙模式**：自動偵測設備環境，支援桌面版 2D 螢幕互動與 WebXR 6-DOF 全沉浸模式（搭配頭部追蹤與立體視覺）。
*   🎢 **動態環境生成**：
    *   提供多種特色主題：**Deep Sea (海底)、Sky Realm (天空)、Forest Land (陸地)、Synthwave (抽象電子)、Kyoto (京都)**。
    *   每個主題搭配專屬的 360 度天空盒全景圖、粒子特效 (例如雪花、下雨)、動態光影變化（清晨、黃昏、夜晚）與特定的環境植被生成（樹木、岩石）。
*   🏅 **競速與收集要素**：軌道上隨機佈置可讓雲霄飛車瞬間加速的「加速圈」以及得分用的「金幣」。
*   🎛️ **雙軌 UI 儀表板設計**：
    *   **網頁版**：設計具備速度、最高 G力、高度與方位的玻璃擬態 (Glassmorphism) 儀表板。
    *   **VR 模式**：獨家開發漂浮於玩家視野前方的 3D 虛擬儀表板，提升未來感。
*   🎶 **動態立體音效**：利用 Web Audio API 即時運算，車體引擎聲會隨著速度拉升而動態改變音頻，搭配各主題的專屬 BGM (背景音樂)。

---

## 🛠️ 技術運用 (Technologies Used)

本專案堅持「輕量化、高效能」原則，不依賴龐大的編譯框架 (如 Webpack/React)，透過原生的網頁標準與外部繪圖引擎直接打造最流暢的 3D 體驗：

1.  **3D 渲染核心：[Three.js](https://threejs.org/)**
    *   處理 3D 模型的導入 (車體模型)、物理光影 (Directional Light, Bloom 光暈後處理)、以及攝影機鏡頭追蹤。
    *   利用 `CatmullRomCurve3` 曲線數學生成連續平滑的 3D 軌道。
2.  **虛擬實境標準：[WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)**
    *   透過瀏覽器原生支援，連接頭戴式裝置 (HTC VIVE XR Elite)。
    *   實現雙眼分別渲染 (Stereo Rendering) 以及控制器的空間定位。
3.  **UI 與前端排版：HTML5 / Vanilla CSS**
    *   運用 CSS Flexbox / Grid 及絕對定位處理桌面端的現代感覆蓋層 UI。
    *   利用 HTML5 `<canvas>` 作為材質貼圖 (CanvasTexture) 投影到 3D 空間，實作 VR 內部的文字儀表板，突破在 VR 中無法直接渲染 HTML 元素的限制。
4.  **音效處理：[Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)**
    *   處理背景音軌與效果音的混合。
    *   即時改變音效的 `playbackRate`，重現雲霄飛車在陡坡俯衝時高亢的車輪和風切聲。
5.  **開發測試工具：ngrok & Python HTTP Server**
    *   運用 `ngrok` 建立安全的 HTTPS 隧道，確保本機開發的程式碼能完美避開跨裝置 Wi-Fi 的安全限制，安全且即時地推播至 VR 頭顯裝置進行測試。

---

## 🚀 如何運行與測試 (How to Run)

1. **取得專案**：將專案從 GitHub Clone 下來，或直接下載資料夾。
2. **啟動伺服器**：在資料夾根目錄透過終端機啟動本地 Http 伺服器，例如：
   ```bash
   python -m http.server 8080
   ```
3. **桌面遊玩**：打開瀏覽器前往 `http://localhost:8080` 即可開始遊戲。
4. **VR 遊玩**：打開終端機執行 `ngrok http 8080` 取得 `https` 網址，並將其輸入至 HTC VIVE XR Elite 瀏覽器中，點擊 **"ENTER VR RIDE"**，即可穿梭於軌道之間！
