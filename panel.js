document.addEventListener("DOMContentLoaded", function () {
    const fileListDiv = document.getElementById("fileList");
    const downloadBtn = document.getElementById("download");
    const refreshBtn = document.getElementById("refresh");
    const fileCountSpan = document.getElementById("fileCount");
    const versionSpan = document.getElementById("version");
    const githubBtn = document.getElementById("github");
    const discordBtn = document.getElementById("discord");
    const searchInput = document.getElementById("searchInput");
    const settingsButton = document.getElementById("settingsButton");
    const settingsModal = document.getElementById("settingsModal");
    const closeModal = document.querySelector(".close");
    const creditsDiv = document.getElementById("credits");
    const progressBar = document.querySelector(".progress-bar .progress");
    let files = {};

    // Fetch and display the version from manifest.json
    fetch(chrome.runtime.getURL('manifest.json'))
        .then(response => response.json())
        .then(manifest => {
            versionSpan.textContent = `v${manifest.version}`;
        });

    const textFileExtensions = [".html", ".htm", "css", "js", "json"];

    // File Search
    searchInput.addEventListener("input", function () {
        const query = searchInput.value.toLowerCase();
        const fileItems = fileListDiv.querySelectorAll("div");

        fileItems.forEach(item => {
            const url = item.querySelector("span").textContent.toLowerCase();
            if (url.includes(query)) {
                item.style.display = "flex";
                item.style.backgroundColor = "#f0f0f0";
            } else {
                item.style.display = "none";
                item.style.backgroundColor = "";
            }
        });
    });

    // Settings Modal
    settingsButton.addEventListener("click", function () {
        settingsModal.style.display = "block";
    });

    closeModal.addEventListener("click", function () {
        settingsModal.style.display = "none";
    });

    window.addEventListener("click", function (event) {
        if (event.target === settingsModal) {
            settingsModal.style.display = "none";
        }
    });

    // Add network requests to the file list
    chrome.devtools.network.onRequestFinished.addListener(request => {
        const url = request.request.url;
        if (!files[url]) {
            const urlObj = new URL(url);
            if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") return;
            files[url] = request;

            fileListDiv.innerHTML += `
                <div>
                    <span>${url}</span>
                </div>
            `;
            fileCountSpan.textContent = Object.keys(files).length;
        }
    });

    // Refresh files
    refreshBtn.addEventListener("click", async function () {
        // Clear the current file list
        files = {};
        fileListDiv.innerHTML = "";
        fileCountSpan.textContent = "0";

        // Reload the page
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.reload(tabs[0].id);
        });
    });

    // Download files as ZIP
    downloadBtn.addEventListener("click", async function () {
        const zip = new JSZip();
        let mainUrl = "network_zipper";
        try {
            const urls = Object.keys(files);
            if (urls.length > 0) {
                mainUrl = new URL(urls[0]).hostname;
            }
        } catch (e) {
            console.error("Error getting main URL:", e);
            alert("Failed to determine the main URL. Please try again.");
            return;
        }

        const filePromises = Object.keys(files).map(async (url, index) => {
            try {
                const urlObj = new URL(url);
                let filePath = urlObj.hostname + urlObj.pathname;
                if (filePath.endsWith("/")) filePath += "index.html";
                if (!filePath.split("/").pop().includes(".")) filePath += ".html";
                const extension = filePath.split(".").pop();
                const isTextFile = textFileExtensions.includes(`.${extension}`);

                let fileContent;
                if (isTextFile) {
                    const response = await new Promise((resolve, reject) => {
                        files[url].getContent((content, encoding) => {
                            if (encoding === 'base64') {
                                content = atob(content);
                            }
                            resolve(content);
                        });
                    });
                    fileContent = new TextEncoder().encode(response);

                    if (fileContent.length === 0) {
                        const response = await fetch(urlObj, {
                            headers: {
                                "Origin": urlObj.origin,
                                "Referrer": urlObj.href
                            },
                            method: "GET"
                        });
                        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
                        const content = await response.text();
                        fileContent = new TextEncoder().encode(content);
                    }
                } else {
                    const response = await fetch(url, {
                        headers: {
                            "Origin": urlObj.origin,
                            "Referrer": urlObj.href
                        },
                        method: "GET"
                    });
                    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
                    const blob = await response.blob();
                    fileContent = await blob.arrayBuffer();
                }

                // Update progress bar
                const progress = ((index + 1) / Object.keys(files).length) * 100;
                progressBar.style.width = `${progress}%`;

                zip.file(decodeURIComponent(filePath), fileContent);
            } catch (e) {
                console.error("Error processing URL:", url, e);
                alert(`Failed to process file: ${url}. Please check the console for details.`);
            }
        });

        try {
            await Promise.all(filePromises);
            const zipContent = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(zipContent);
            link.download = `${mainUrl}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error("Error generating zip:", e);
            alert("Failed to generate the ZIP file. Please try again.");
        } finally {
            // Reset progress bar after download
            progressBar.style.width = "0%";
        }
    });

    // GitHub Button
    githubBtn.addEventListener("click", function () {
        window.open("https://github.com/genizy/network-zipper", "_blank");
    });

    // Discord Button
    discordBtn.addEventListener("click", function () {
        window.open("https://discord.gg/NAFw4ykZ7n", "_blank");
    });

    // Display credits in the settings page
    creditsDiv.innerHTML = `
        <p>Network Zipper Modded - Created by aukak</p>
    `;

    // Check for updates
    fetch('https://raw.githubusercontent.com/aukak/network-zipper-modded/main/manifest.json')
        .then(response => response.json())
        .then(latestManifest => {
            fetch(chrome.runtime.getURL('manifest.json'))
                .then(response => response.json())
                .then(currentManifest => {
                    if (latestManifest.version > currentManifest.version) {
                        const updateBanner = document.createElement('div');
                        updateBanner.innerHTML = `
                            A new version is available! 
                            <a href="https://github.com/aukak/network-zipper-modded" target="_blank">
                                Update from v${currentManifest.version} to v${latestManifest.version}
                            </a>
                        `;
                        updateBanner.style.position = 'fixed';
                        updateBanner.style.top = '0';
                        updateBanner.style.width = '100%';
                        updateBanner.style.backgroundColor = 'white';
                        updateBanner.style.color = 'black';
                        updateBanner.style.textAlign = 'center';
                        updateBanner.style.padding = '10px';
                        document.body.appendChild(updateBanner);
                    }
                });
        });
});
