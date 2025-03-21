document.addEventListener("DOMContentLoaded", function () {
    const fileListDiv = document.getElementById("fileList");
    const downloadBtn = document.getElementById("download");
    const refreshBtn = document.getElementById("refresh");
    const inspectBtn = document.getElementById("inspect");
    const beautify = document.getElementById('beautify');
    const fileCountSpan = document.getElementById("fileCount");
    const versionSpan = document.getElementById("version");
    const githubBtn = document.getElementById("github");
    const discordBtn = document.getElementById("discord");
    const searchInput = document.getElementById("searchInput");
    const settingsButton = document.getElementById("settingsButton");
    const settingsModal = document.getElementById("settingsModal");
    const closeModal = document.querySelector(".close");
    const creditsDiv = document.getElementById("credits");
    let files = {};
    let isInspecting = false;

    // Fetch and display the version from manifest.json
    fetch(chrome.runtime.getURL('manifest.json'))
        .then(response => response.json())
        .then(manifest => {
            versionSpan.textContent = `v${manifest.version}`;
        });

    const textFileExtensions = [".html", ".css", ".js", ".json", ".txt"];

    // File Search with CSS style
    searchInput.addEventListener("input", function () {
        const query = searchInput.value.toLowerCase();
        const fileItems = fileListDiv.querySelectorAll("div");

        fileItems.forEach(item => {
            const url = item.querySelector("span").textContent.toLowerCase();
            if (url.includes(query)) {
                item.style.display = "flex";
                item.style.backgroundColor = "#f0f0f0"; // Highlight matched items
            } else {
                item.style.display = "none";
                item.style.backgroundColor = ""; // Reset background if not matched
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

    // Inspect Element
    function startInspecting() {
        isInspecting = true;
        inspectBtn.textContent = "Stop Inspecting";
        inspectBtn.classList.add("primary");

        chrome.devtools.inspectedWindow.eval(`
            (function() {
                const style = document.createElement('style');
                style.textContent = \`
                    .network-zipper-hover {
                        outline: 2px solid red !important;
                    }
                \`;
                document.head.appendChild(style);

                function handleMouseOver(event) {
                    event.target.classList.add('network-zipper-hover');
                }

                function handleMouseOut(event) {
                    event.target.classList.remove('network-zipper-hover');
                }

                function handleClick(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    const element = event.target;

                    const urls = Array.from(element.querySelectorAll('*'))
                        .map(el => el.src || el.href || el.style?.backgroundImage?.replace(/url\\(["']?(.*?)["']?\\)/, "$1"))
                        .filter(url => url && (url.startsWith('http://') || url.startsWith('https://')));

                    window.postMessage({ type: 'NETWORK_ZIPPER_INSPECT', urls }, '*');
                }

                document.addEventListener('mouseover', handleMouseOver);
                document.addEventListener('mouseout', handleMouseOut);
                document.addEventListener('click', handleClick, true);

                window.networkZipperCleanup = function() {
                    document.removeEventListener('mouseover', handleMouseOver);
                    document.removeEventListener('mouseout', handleMouseOut);
                    document.removeEventListener('click', handleClick, true);
                    document.head.removeChild(style);
                };
            })();
        `);
    }

    function stopInspecting() {
        isInspecting = false;
        inspectBtn.textContent = "Inspect Element";
        inspectBtn.classList.remove("primary");

        chrome.devtools.inspectedWindow.eval(`
            if (window.networkZipperCleanup) {
                window.networkZipperCleanup();
            }
        `);
    }

    inspectBtn.addEventListener("click", function () {
        if (isInspecting) {
            stopInspecting();
        } else {
            startInspecting();
        }
    });

    // Listen for messages from the inspected page
    window.addEventListener("message", function (event) {
        if (event.data.type === 'NETWORK_ZIPPER_INSPECT') {
            const urls = event.data.urls;
            files = {};
            fileListDiv.innerHTML = "";
            urls.forEach(url => {
                files[url] = { request: { url } };
                fileListDiv.innerHTML += `
                    <div>
                        <span>${url}</span>
                    </div>
                `;
            });
            fileCountSpan.textContent = urls.length;
            stopInspecting();
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
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.reload(tabs[0].id);
        });
        files = {};
        fileListDiv.innerHTML = "";
    });

    // Download files as ZIP
    downloadBtn.addEventListener("click", async function () {
        const zip = new JSZip();
        const filePromises = Object.keys(files).map(async (url) => {
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

                    if (beautify.checked) {
                        switch (extension) {
                            case 'html':
                                fileContent = html_beautify(response, { indent_size: 2 });
                                break;
                            case 'css':
                                fileContent = css_beautify(response, { indent_size: 2 });
                                break;
                            case 'js':
                                fileContent = js_beautify(response, { indent_size: 2 });
                                break;
                            case 'json':
                                fileContent = JSON.stringify(JSON.parse(response), null, 2);
                                break;
                            default:
                                break;
                        }
                    }
                } else {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
                    const blob = await response.blob();
                    fileContent = await blob.arrayBuffer();
                }

                // Create folders based on the path
                const folders = filePath.split("/").slice(0, -1);
                let currentFolder = zip;
                folders.forEach(folder => {
                    currentFolder = currentFolder.folder(folder);
                });

                // Add file to the correct folder
                const fileName = filePath.split("/").pop();
                currentFolder.file(fileName, fileContent);
            } catch (e) {
                console.error("Error processing URL:", url, e);
            }
        });

        try {
            await Promise.all(filePromises);
            const zipContent = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(zipContent);
            link.download = "network_zipper.zip";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error("Error generating zip:", e);
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
});
