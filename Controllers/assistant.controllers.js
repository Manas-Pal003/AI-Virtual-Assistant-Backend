import aiResponse from "../gemini.js";
import YT from "youtube-sr";
import User from "../Models/user.model.js";
import { exec } from "child_process";
import os from "os";
import axios from "axios";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
const YouTube = YT.YouTube;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openUrl = (url) => {
  // Try to open in Google Chrome first (since the user's project runs there).
  // Fall back to the system default browser if Chrome is not available.
  exec(`start chrome "${url}"`, (error) => {
    if (error) {
      exec(`start "" "${url}"`, (fallbackError) => {
        if (fallbackError) {
          console.error("Failed to open URL in fallback:", fallbackError);
        }
      });
    }
  });
};

const setSystemVolume = (percentage) => {
  const vol = Math.min(Math.max(parseInt(percentage, 10) || 0, 0), 100);
  console.log(`Setting system volume to: ${vol}%`);

  if (os.platform() === "win32") {
    const scriptPath = path.join(__dirname, "../Scripts/set-volume.ps1");
    const execCmd = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" -Percent ${vol}`;
    exec(execCmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Failed to set system volume on Windows:", error);
      } else {
        console.log(`Windows volume set to ${vol}% successfully. Output: ${stdout.trim()}`);
      }
    });
  } else if (os.platform() === "darwin") {
    const execCmd = `osascript -e "set volume output volume ${vol}"`;
    exec(execCmd, (error) => {
      if (error) {
        console.error("Failed to set system volume on macOS:", error);
      }
    });
  } else {
    const execCmd = `amixer set Master ${vol}% || pactl set-sink-volume @DEFAULT_SINK@ ${vol}%`;
    exec(execCmd, (error) => {
      if (error) {
        console.error("Failed to set system volume on Linux:", error);
      }
    });
  }
};

const runShellCommand = (cmd) => {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout) => {
      if (error) {
        resolve("");
      } else {
        resolve(stdout.trim());
      }
    });
  });
};

const getBatteryInfo = async () => {
  let percentage = null;
  let isPluggedIn = null;
  let remainingTime = null;

  if (os.platform() === "win32") {
    try {
      const psCommand = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SystemInformation]::PowerStatus | Select-Object -Property PowerLineStatus, BatteryChargeStatus, BatteryLifePercent, BatteryLifeRemaining | ConvertTo-Json`;
      const output = await runShellCommand(`powershell -Command "${psCommand}"`);
      if (output) {
        const data = JSON.parse(output);
        // BatteryChargeStatus 128 indicates NoSystemBattery
        if (data.BatteryChargeStatus === 128 || (data.BatteryChargeStatus & 128) === 128) {
          return { percentage: null, isPluggedIn: null, remainingTime: null };
        }
        if (data.BatteryLifePercent !== undefined && data.BatteryLifePercent !== null) {
          percentage = Math.round(data.BatteryLifePercent * 100);
        }
        if (data.PowerLineStatus === 1) {
          isPluggedIn = true;
        } else if (data.PowerLineStatus === 0) {
          isPluggedIn = false;
        }
        if (data.BatteryLifeRemaining !== undefined && data.BatteryLifeRemaining > 0) {
          remainingTime = Math.round(data.BatteryLifeRemaining / 60);
        }
      }
    } catch (e) {
      console.error("Failed to get battery info via PowerShell:", e);
    }
  } else if (os.platform() === "darwin") {
    try {
      const output = await runShellCommand("pmset -g batt");
      if (output) {
        const percentMatch = output.match(/(\d+)%/);
        if (percentMatch) percentage = parseInt(percentMatch[1], 10);

        isPluggedIn = output.includes("AC Power") || output.includes("charging");

        const timeMatch = output.match(/(\d+):(\d+) remaining/);
        if (timeMatch) {
          remainingTime = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
        }
      }
    } catch (e) {
      console.error("Failed to get macOS battery info:", e);
    }
  } else {
    try {
      const output = await runShellCommand("upower -i $(upower -e | grep 'BAT')");
      if (output) {
        const percentMatch = output.match(/percentage:\s*(\d+)%/i);
        if (percentMatch) percentage = parseInt(percentMatch[1], 10);

        const stateMatch = output.match(/state:\s*(\S+)/i);
        if (stateMatch) {
          isPluggedIn = stateMatch[1].toLowerCase() === "charging" || stateMatch[1].toLowerCase() === "fully-charged";
        }

        const timeMatch = output.match(/time to empty:\s*([\d.]+)\s*(\S+)/i);
        if (timeMatch) {
          const val = parseFloat(timeMatch[1]);
          const unit = timeMatch[2].toLowerCase();
          if (unit.startsWith("hour")) remainingTime = Math.round(val * 60);
          else if (unit.startsWith("min")) remainingTime = Math.round(val);
        }
      }
    } catch (e) {
      console.error("Failed to get Linux battery info:", e);
    }
  }

  return { percentage, isPluggedIn, remainingTime };
};

const getSystemInfo = async () => {
  const cpu = os.cpus()[0]?.model?.trim() || "Unknown Processor";
  const totalGb = Math.ceil(os.totalmem() / (1024 * 1024 * 1024));
  const freeGb = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);

  let osName = "Unknown OS";
  let diskInfo = "";
  let manufacturer = "Unknown Manufacturer";
  let model = "Unknown Model";

  if (os.platform() === "win32") {
    try {
      const psCommand = `@(Get-CimInstance Win32_ComputerSystem | Select-Object -Property Manufacturer, Model; Get-CimInstance Win32_OperatingSystem | Select-Object -Property Caption; Get-CimInstance Win32_LogicalDisk -Filter 'DeviceID=''C:''' | Select-Object -Property Size, FreeSpace) | ConvertTo-Json -Compress`;
      const output = await runShellCommand(`powershell -Command "${psCommand}"`);
      if (output) {
        const data = JSON.parse(output);
        if (Array.isArray(data) && data.length >= 3) {
          manufacturer = data[0]?.Manufacturer?.trim() || "Unknown Manufacturer";
          model = data[0]?.Model?.trim() || "Unknown Model";
          osName = data[1]?.Caption?.trim() || "Microsoft Windows";
          
          const size = data[2]?.Size;
          const freeSpace = data[2]?.FreeSpace;
          if (size && freeSpace) {
            const totalDisk = (parseInt(size, 10) / (1024 * 1024 * 1024)).toFixed(1);
            const freeDisk = (parseInt(freeSpace, 10) / (1024 * 1024 * 1024)).toFixed(1);
            diskInfo = `• Storage (Drive C): ${totalDisk} GB total, with ${freeDisk} GB free.`;
          }
        }
      }
    } catch (e) {
      console.error("Failed to parse system info via PowerShell:", e);
    }
    
    // Fallback if PowerShell output failed
    if (osName === "Unknown OS") {
      osName = "Windows Operating System";
      const osCaption = await runShellCommand("wmic os get Caption /Value");
      if (osCaption) {
        const match = osCaption.match(/Caption=(.+)/i);
        if (match) osName = match[1].trim();
      }
    }
    if (!diskInfo) {
      const diskOutput = await runShellCommand("wmic logicaldisk where \"DeviceID='C:'\" get FreeSpace,Size /Value");
      if (diskOutput) {
        const sizeMatch = diskOutput.match(/Size=(\d+)/i);
        const freeMatch = diskOutput.match(/FreeSpace=(\d+)/i);
        if (sizeMatch && freeMatch) {
          const totalDisk = (parseInt(sizeMatch[1], 10) / (1024 * 1024 * 1024)).toFixed(1);
          const freeDisk = (parseInt(freeMatch[1], 10) / (1024 * 1024 * 1024)).toFixed(1);
          diskInfo = `• Storage (Drive C): ${totalDisk} GB total, with ${freeDisk} GB free.`;
        }
      }
    }
  } else if (os.platform() === "darwin") {
    osName = "macOS " + (await runShellCommand("sw_vers -productVersion"));
    manufacturer = "Apple Inc.";
    model = await runShellCommand("sysctl -n hw.model");
    
    const dfOutput = await runShellCommand("df -h / | tail -1");
    if (dfOutput) {
      const parts = dfOutput.split(/\s+/);
      if (parts.length >= 4) {
        diskInfo = `• Storage: ${parts[1]} total, with ${parts[3]} free.`;
      }
    }
  } else {
    osName = "Linux " + (await runShellCommand("uname -r"));
    manufacturer = (await runShellCommand("cat /sys/class/dmi/id/sys_vendor")) || "Unknown Manufacturer";
    model = (await runShellCommand("cat /sys/class/dmi/id/product_name")) || "Unknown Model";
    
    const dfOutput = await runShellCommand("df -h / | tail -1");
    if (dfOutput) {
      const parts = dfOutput.split(/\s+/);
      if (parts.length >= 4) {
        diskInfo = `• Storage: ${parts[1]} total, with ${parts[3]} free.`;
      }
    }
  }

  const battery = await getBatteryInfo();

  return {
    osName,
    cpu,
    totalGb,
    freeGb,
    diskInfo,
    manufacturer,
    model,
    battery
  };
};

const searchWeb = async (query) => {
  try {
    const url = "https://lite.duckduckgo.com/lite/";
    const response = await axios.post(url, new URLSearchParams({ q: query }).toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      timeout: 5000
    });

    const html = response.data;
    const results = [];
    const linkReg = /<a rel="nofollow" href="([^"]+)" class='result-link'>([\s\S]*?)<\/a>/g;
    
    let match;
    while ((match = linkReg.exec(html)) !== null && results.length < 5) {
      const href = match[1];
      const title = match[2].replace(/<[^>]*>/g, "").trim();
      
      const searchStartIndex = match.index + match[0].length;
      const snippetPart = html.substring(searchStartIndex, searchStartIndex + 1500);
      const snippetMatch = snippetPart.match(/<td class='result-snippet'>([\s\S]*?)<\/td>/i);
      
      let snippet = "";
      if (snippetMatch) {
        snippet = snippetMatch[1].replace(/<[^>]*>/g, "").trim();
      }
      
      results.push({ title, url: href, snippet });
    }
    return results;
  } catch (error) {
    console.error("DuckDuckGo search failed:", error.message);
    return [];
  }
};

const launchLocalApp = (appName) => {
  const cleanApp = appName.toLowerCase().trim();
  
  // Folders mapping
  const homeDir = os.homedir();
  const foldersMapping = {
    "downloads": path.join(homeDir, "Downloads"),
    "download": path.join(homeDir, "Downloads"),
    "downloads folder": path.join(homeDir, "Downloads"),
    "download folder": path.join(homeDir, "Downloads"),
    
    "documents": path.join(homeDir, "Documents"),
    "document": path.join(homeDir, "Documents"),
    "documents folder": path.join(homeDir, "Documents"),
    "document folder": path.join(homeDir, "Documents"),
    
    "desktop": path.join(homeDir, "Desktop"),
    "desktop folder": path.join(homeDir, "Desktop"),
    
    "pictures": path.join(homeDir, "Pictures"),
    "picture": path.join(homeDir, "Pictures"),
    "pictures folder": path.join(homeDir, "Pictures"),
    "picture folder": path.join(homeDir, "Pictures"),
    
    "music": path.join(homeDir, "Music"),
    "music folder": path.join(homeDir, "Music"),
    
    "videos": path.join(homeDir, "Videos"),
    "video": path.join(homeDir, "Videos"),
    "videos folder": path.join(homeDir, "Videos"),
    "video folder": path.join(homeDir, "Videos"),
    
    "home": homeDir,
    "home folder": homeDir,
    
    "c drive": "C:\\",
    "d drive": "D:\\",
    "local disk c": "C:\\",
    "local disk d": "D:\\"
  };

  const folderPath = foldersMapping[cleanApp];
  if (folderPath) {
    if (fs.existsSync(folderPath)) {
      let execCmd = "";
      if (os.platform() === "win32") {
        execCmd = `start "" "${folderPath}"`;
      } else if (os.platform() === "darwin") {
        execCmd = `open "${folderPath}"`;
      } else {
        execCmd = `xdg-open "${folderPath}"`;
      }
      
      console.log(`Attempting to open folder via: ${execCmd}`);
      return new Promise((resolve) => {
        exec(execCmd, (error) => {
          if (error) {
            console.error(`Failed to open folder: ${execCmd}`, error);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    }
    console.warn(`Folder path does not exist: ${folderPath}`);
    return false;
  }
  
  // Mapping of friendly names to execution commands/paths on Windows/Mac/Linux
  const appMapping = {
    "vs code": ["code", `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe`],
    "vscode": ["code", `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe`],
    "visual studio code": ["code", `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe`],
    "notepad": ["notepad"],
    "calculator": ["calc"],
    "calc": ["calc"],
    "cmd": ["cmd"],
    "command prompt": ["cmd"],
    "powershell": ["powershell"],
    "chrome": ["chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"],
    "google chrome": ["chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"],
    "edge": ["msedge"],
    "microsoft edge": ["msedge"],
    "explorer": ["explorer"],
    "file explorer": ["explorer"],
    "paint": ["mspaint"],
    "mspaint": ["mspaint"],
    "word": ["winword"],
    "excel": ["excel"],
    "powerpoint": ["powerpnt"],
    "task manager": ["taskmgr"],
    "taskmgr": ["taskmgr"],
    "whatsapp": ["whatsapp://", "whatsapp"],
    "spotify": ["spotify://", "spotify", `${process.env.USERPROFILE}\\AppData\\Roaming\\Spotify\\Spotify.exe`],
    "discord": ["discord://", "discord", `${process.env.USERPROFILE}\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe`],
    "telegram": ["tg://", "telegram"],
    "notion": ["notion://", "notion"],
    "figma": ["figma://", "figma"],
    "canva": ["canva"]
  };

  // If we have a mapping, try those commands. Otherwise, try the app name directly.
  const commands = appMapping[cleanApp] || [cleanApp];

  return new Promise((resolve) => {
    const tryLaunch = (index) => {
      if (index >= commands.length) {
        resolve(false);
        return;
      }
      
      const cmd = commands[index];
      let execCmd = "";
      if (os.platform() === "win32") {
        execCmd = `start "" "${cmd}"`;
      } else if (os.platform() === "darwin") {
        const macMapping = {
          "code": "Visual Studio Code",
          "chrome": "Google Chrome",
          "spotify": "Spotify",
          "discord": "Discord"
        };
        const appNameMac = macMapping[cmd] || cmd;
        execCmd = `open -a "${appNameMac}"`;
      } else {
        execCmd = `${cmd} &`;
      }

      console.log(`Attempting to launch local app via: ${execCmd}`);
      exec(execCmd, (error) => {
        if (error) {
          console.warn(`Launch failed for: ${execCmd}. Trying next option...`);
          tryLaunch(index + 1);
        } else {
          resolve(true);
        }
      });
    };

    tryLaunch(0);
  });
};

const saveToHistory = async (userId, userMessage, assistantReply, url = null) => {
  try {
    const messagesToPush = [
      { role: "user", text: userMessage },
      { role: "assistant", text: assistantReply }
    ];
    if (url) {
      messagesToPush[1].url = url;
    }
    await User.findByIdAndUpdate(userId, {
      $push: {
        history: {
          $each: messagesToPush
        }
      }
    }, { bufferCommands: false });
  } catch (err) {
    console.error("Failed to save to history:", err);
  }
};

export const askAssistant = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        message: "Message is required",
      });
    }

    const lowerMessage = message.toLowerCase();

    let searchResultsStr = "";
    let searchUrl = null;


    // --- OPEN WEBSITE COMMANDS ---
    if (lowerMessage.includes("open")) {
      const websites = {
        google: "https://www.google.com",
        youtube: "https://www.youtube.com",
        chatgpt: "https://chat.openai.com",
        "chat gpt": "https://chat.openai.com",
        gmail: "https://mail.google.com",
        github: "https://github.com",
        instagram: "https://www.instagram.com",
        facebook: "https://www.facebook.com",
        twitter: "https://x.com",
        x: "https://x.com",
        linkedin: "https://www.linkedin.com",
        whatsapp: "https://web.whatsapp.com",
        reddit: "https://www.reddit.com",
        amazon: "https://www.amazon.in",
        flipkart: "https://www.flipkart.com",
        netflix: "https://www.netflix.com",
        spotify: "https://open.spotify.com",
        wikipedia: "https://www.wikipedia.org",
        stackoverflow: "https://stackoverflow.com",
        "stack overflow": "https://stackoverflow.com",
        discord: "https://discord.com",
        telegram: "https://web.telegram.org",
        pinterest: "https://www.pinterest.com",
        canva: "https://www.canva.com",
        figma: "https://www.figma.com",
        notion: "https://www.notion.so",
        drive: "https://drive.google.com",
        "google drive": "https://drive.google.com",
        maps: "https://maps.google.com",
        "google maps": "https://maps.google.com",
        calendar: "https://calendar.google.com",
        puter: "https://puter.com",
      };

      const siteName = message
        .replace(/\bopen\b/gi, "")
        .replace(/\bplease\b/gi, "")
        .replace(/\bfor me\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      if (siteName) {
        const cleanName = siteName.toLowerCase().replace(/\s+/g, "");
        
        // Check if this matches a local app mapping explicitly
        const hasLocalAppMapping = [
          "vs code", "vscode", "visual studio code", "notepad", "calculator", "calc", 
          "cmd", "command prompt", "powershell", "chrome", "google chrome", "edge", 
          "microsoft edge", "explorer", "file explorer", "paint", "mspaint", "word", 
          "excel", "powerpoint", "task manager", "taskmgr", "spotify", "discord", 
          "whatsapp", "telegram", "notion", "figma", "canva"
        ].includes(siteName.toLowerCase().trim());

        const isKnownWebsite = Object.keys(websites).some(key => cleanName === key || cleanName.includes(key));
        
        // Try to launch locally if it is explicitly mapped as a local app OR is not a known website
        if (hasLocalAppMapping || !isKnownWebsite) {
          console.log(`Attempting to launch local application/folder for "${siteName}"...`);
          const launched = await launchLocalApp(siteName);
          if (launched) {
            const reply = `Opening ${siteName} on your system.`;
            await saveToHistory(req.userId, message, reply);
            return res.status(200).json({
              type: "command",
              reply: reply,
            });
          }
        }

        // Fallback 1: Try to match a known website mapping
        for (const [name, url] of Object.entries(websites)) {
          if (cleanName === name || cleanName.includes(name) || lowerMessage.includes(name)) {
            const reply = `Opening ${name.charAt(0).toUpperCase() + name.slice(1)} for you.`;
            await saveToHistory(req.userId, message, reply, url);
            openUrl(url);
            return res.status(200).json({
              type: "command",
              url: url,
              reply: reply,
            });
          }
        }

        // Fallback 2: Default catch-all Web URL (.com)
        const reply = `Opening ${siteName} for you.`;
        const url = `https://www.${cleanName}.com`;
        await saveToHistory(req.userId, message, reply, url);
        openUrl(url);
        return res.status(200).json({
          type: "command",
          url: url,
          reply: reply,
        });
      }
    }


    // --- PLAY SONG / VIDEO / SEARCH ON YOUTUBE ---
    if (
      lowerMessage.includes("play") ||
      (lowerMessage.includes("youtube") && lowerMessage.includes("search")) ||
      (lowerMessage.includes("song") && !lowerMessage.includes("search")) ||
      (lowerMessage.includes("music") && !lowerMessage.includes("search"))
    ) {
      const songQuery = message
        .replace(/\bplay\b/gi, "")
        .replace(/\bplaying\b/gi, "")
        .replace(/\bsearch\b/gi, "")
        .replace(/\bsearching\b/gi, "")
        .replace(/\ba song for me\b/gi, "")
        .replace(/\bon youtube\b/gi, "")
        .replace(/\byoutube\b/gi, "")
        .replace(/\bplease\b/gi, "")
        .replace(/\bfor me\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      if (songQuery) {
        // If explicitly asked to search, go to YouTube search results directly
        if (lowerMessage.includes("search")) {
          const reply = `Searching YouTube for "${songQuery}".`;
          const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`;
          await saveToHistory(req.userId, message, reply, url);
          openUrl(url);
          return res.status(200).json({
            type: "command",
            url: url,
            reply: reply,
          });
        }

        try {
          const results = await YouTube.search(songQuery, { limit: 1, type: "video" });

          if (results && results.length > 0) {
            const video = results[0];
            const watchUrl = video.url || `https://www.youtube.com/watch?v=${video.id}`;
            const reply = `Playing "${video.title}" on YouTube for you.`;
            await saveToHistory(req.userId, message, reply, watchUrl);
            openUrl(watchUrl);
            return res.status(200).json({
              type: "command",
              url: watchUrl,
              reply: reply,
            });
          }
        } catch (ytError) {
          console.error("YouTube search error:", ytError.message);
        }

        // Fallback: open YouTube search results if direct search fails
        const reply = `Searching YouTube for "${songQuery}".`;
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`;
        await saveToHistory(req.userId, message, reply, url);
        openUrl(url);
        return res.status(200).json({
          type: "command",
          url: url,
          reply: reply,
        });
      }
    }

    if (
      lowerMessage.startsWith("search ") ||
      lowerMessage.includes("google search") ||
      lowerMessage.includes("search google") ||
      lowerMessage.includes("search on google")
    ) {
      const query = message
        .replace(/\bgoogle search\b/gi, "")
        .replace(/\bsearch google\b/gi, "")
        .replace(/\bsearch on google\b/gi, "")
        .replace(/\bsearch for\b/gi, "")
        .replace(/\bsearch\b/gi, "")
        .replace(/\bgoogle\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      const reply = `Opening Google search for "${query}" right away.`;
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      await saveToHistory(req.userId, message, reply, url);
      openUrl(url);
      return res.status(200).json({
        type: "command",
        url: url,
        reply: reply,
      });
    }

    // --- LIVE / REAL-TIME INFO INTERCEPT ---
    const liveQueryRegex = /\b(weather|score|live score|news|headlines|next match|upcoming match|cricket match|football match|sports update|match schedule|points table|showtimes|movie release|upcoming movie)\b/i;
    if (liveQueryRegex.test(lowerMessage)) {
      console.log(`Live query detected: "${message}". Performing programmatic search...`);
      const results = await searchWeb(message);
      if (results && results.length > 0) {
        searchUrl = `https://www.google.com/search?q=${encodeURIComponent(message.trim())}`;
        searchResultsStr = `
=== LIVE WEB SEARCH RESULTS ===
The user's query required live/recent information. Here are real-time search results fetched from the web. Use these to answer the user's question directly, accurately, and conversationally in the chat:
${results.map((r, i) => `[Result ${i+1}]\nTitle: ${r.title}\nSnippet: ${r.snippet}\nSource: ${r.url}`).join("\n\n")}
`;
      } else {
        // Fallback: if search fails, open in Chrome automatically
        const url = `https://www.google.com/search?q=${encodeURIComponent(message.trim())}`;
        const reply = `Searching Google for "${message}" to get the latest real-time information.`;
        await saveToHistory(req.userId, message, reply, url);
        openUrl(url);
        return res.status(200).json({
          type: "command",
          url: url,
          reply: reply,
        });
      }
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Kolkata",
    });
    const timeStr = now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });

    const assistantName = req.body.assistantName || "JARVIS";

    // Fetch user history for context
    let user = null;
    try {
      user = await User.findById(req.userId).setOptions({ bufferCommands: false });
    } catch (dbError) {
      console.warn("Database lookup failed (using offline fallback mode):", dbError.message);
    }
    let historyStr = "";
    if (user && user.history && user.history.length > 0) {
      const recentHistory = user.history.slice(-15);
      historyStr = recentHistory
        .map((msg) => `${msg.role === "user" ? "User" : assistantName}: ${msg.text}`)
        .join("\n");
    }

    const userName = user?.name ? user.name.split(" ")[0] : "Manas";

    // --- EMAIL COMMANDS ---
    if (
      lowerMessage.includes("send email") ||
      lowerMessage.includes("send mail") ||
      lowerMessage.includes("sending email") ||
      lowerMessage.includes("sending mail") ||
      lowerMessage.includes("compose email") ||
      lowerMessage.includes("compose mail") ||
      lowerMessage.includes("write email") ||
      lowerMessage.includes("write mail") ||
      lowerMessage.includes("email to") ||
      lowerMessage.includes("mail to") ||
      lowerMessage === "email" ||
      lowerMessage === "mail" ||
      /^(?:email|mail)\s+[a-zA-Z0-9@._-]+/i.test(lowerMessage)
    ) {
      let recipient = "";
      let body = "";
      let subject = "Message from " + userName;

      const match = message.match(/(?:email|mail|compose\s+email|compose\s+mail|write\s+email|write\s+mail)(?:\s+to)?\s+([a-zA-Z0-9@._-]+)(?:\s+(?:saying|about|with|subject|body)\s+(.+))?/i);
      if (match) {
        recipient = match[1].trim();
        if (match[2]) {
          body = match[2].trim();
        }
      } else {
        const toIndex = lowerMessage.indexOf(" to ");
        if (toIndex !== -1) {
          const afterTo = message.slice(toIndex + 4).trim();
          const spaceIndex = afterTo.indexOf(" ");
          if (spaceIndex !== -1) {
            recipient = afterTo.slice(0, spaceIndex).trim();
            body = afterTo.slice(spaceIndex + 1).trim();
          } else {
            recipient = afterTo;
          }
        }
      }

      let recipientEmail = recipient;
      if (recipient && !recipient.includes("@")) {
        try {
          const allUsers = await User.find({}).setOptions({ bufferCommands: false });
          const matchedUser = allUsers.find(u => {
            const userNameLower = u.name.toLowerCase();
            const searchNameLower = recipient.toLowerCase();
            return userNameLower.includes(searchNameLower) || searchNameLower.includes(userNameLower);
          });
          if (matchedUser && matchedUser.email) {
            recipientEmail = matchedUser.email;
          } else {
            if (!recipient.includes(".")) {
              recipientEmail = `${recipient}@gmail.com`;
            }
          }
        } catch (dbErr) {
          console.warn("Database lookup failed for email recipient:", dbErr.message);
          recipientEmail = `${recipient}@gmail.com`;
        }
      }

      const gmailUrl = recipientEmail 
        ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipientEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
        : `https://mail.google.com/mail/?view=cm&fs=1`;

      const reply = recipientEmail 
        ? `Opening Gmail compose page for ${recipient} (${recipientEmail}).` 
        : `Opening Gmail compose page.`;

      await saveToHistory(req.userId, message, reply, gmailUrl);
      openUrl(gmailUrl);
      return res.status(200).json({
        type: "command",
        url: gmailUrl,
        reply: reply,
      });
    }

    // --- SYSTEM INFO COMMANDS (MEMORY/RAM) ---
    if (
      lowerMessage.includes("how much ram") ||
      lowerMessage.includes("check ram") ||
      lowerMessage.includes("check memory") ||
      (
        (lowerMessage.includes("ram") || lowerMessage.includes("memory")) &&
        (lowerMessage.includes("laptop") || lowerMessage.includes("computer") || lowerMessage.includes("system") || lowerMessage.includes("pc") || lowerMessage.includes("device"))
      )
    ) {
      const totalGb = Math.ceil(os.totalmem() / (1024 * 1024 * 1024));
      const freeGb = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);

      const reply = `${userName}, your laptop has a total of ${totalGb} GB of RAM, with ${freeGb} GB currently free and available. I am ready and happy to help!`;

      await saveToHistory(req.userId, message, reply);
      return res.status(200).json({
        type: "ai",
        reply: reply,
      });
    }

    // --- SYSTEM INFO COMMANDS (SPECIFICATIONS/SPEC) ---
    if (
      (
        (lowerMessage.includes("laptop") || lowerMessage.includes("computer") || lowerMessage.includes("system") || lowerMessage.includes("pc") || lowerMessage.includes("device")) &&
        (lowerMessage.includes("spec") || lowerMessage.includes("config") || lowerMessage.includes("detail") || lowerMessage.includes("hardware") || lowerMessage.includes("info") || lowerMessage.includes("properties"))
      ) ||
      lowerMessage.includes("system info") ||
      lowerMessage.includes("system details") ||
      lowerMessage.includes("system configuration") ||
      lowerMessage.includes("device info") ||
      lowerMessage.includes("device details")
    ) {
      const sys = await getSystemInfo();

      let reply = `${userName}, here are the specifications of your laptop:\n`;
      reply += `• Operating System: ${sys.osName}\n`;
      reply += `• Processor: ${sys.cpu}\n`;
      reply += `• Installed Memory: ${sys.totalGb} GB of RAM (${sys.freeGb} GB free)\n`;
      if (sys.diskInfo) {
        reply += `${sys.diskInfo}\n`;
      }
      reply += `• System Manufacturer: ${sys.manufacturer}\n`;
      reply += `• System Model: ${sys.model}\n`;
      reply += `\nI am ready and happy to help!`;

      await saveToHistory(req.userId, message, reply);
      return res.status(200).json({
        type: "ai",
        reply: reply,
      });
    }

    // --- SYSTEM CANCEL SHUTDOWN COMMANDS ---
    if (
      lowerMessage === "cancel shutdown" ||
      lowerMessage === "abort shutdown" ||
      lowerMessage.includes("cancel the shutdown") ||
      lowerMessage.includes("abort the shutdown") ||
      lowerMessage.includes("stop the shutdown")
    ) {
      let cancelCmd = "";
      if (os.platform() === "win32") {
        cancelCmd = "shutdown /a";
      } else if (os.platform() === "darwin") {
        cancelCmd = "killall shutdown";
      } else {
        cancelCmd = "shutdown -c";
      }

      console.log(`Executing cancel shutdown command locally: ${cancelCmd}`);
      return new Promise((resolve) => {
        exec(cancelCmd, async (err) => {
          let reply = "";
          if (err) {
            console.error("Cancel shutdown command execution failed:", err);
            reply = `${userName}, I was unable to abort the shutdown. Perhaps no shutdown sequence was active.`;
          } else {
            reply = `${userName}, I have successfully aborted the system shutdown sequence. You are safe! I am ready and happy to help!`;
          }
          await saveToHistory(req.userId, message, reply);
          res.status(200).json({
            type: "cancel-shutdown",
            reply: reply,
          });
          resolve();
        });
      });
    }

    // --- SYSTEM SHUTDOWN COMMANDS ---
    if (
      lowerMessage === "shutdown" ||
      lowerMessage === "shut down" ||
      lowerMessage.includes("shutdown my") ||
      lowerMessage.includes("shut down my") ||
      lowerMessage.includes("turn off my laptop") ||
      lowerMessage.includes("turn off my computer") ||
      lowerMessage.includes("turn off my system") ||
      lowerMessage.includes("power off my laptop") ||
      lowerMessage.includes("power off my computer") ||
      lowerMessage.includes("power off my system")
    ) {
      const reply = `${userName}, I am shutting down the system now. Please save any unsaved work. I am ready and happy to help!`;
      await saveToHistory(req.userId, message, reply);

      let shutdownCmd = "";
      if (os.platform() === "win32") {
        shutdownCmd = "shutdown /s /t 10";
      } else if (os.platform() === "darwin") {
        shutdownCmd = "osascript -e 'tell app \"System Events\" to shut down'";
      } else {
        shutdownCmd = "shutdown -h now";
      }

      console.log(`Executing shutdown command locally: ${shutdownCmd}`);
      return new Promise((resolve) => {
        exec(shutdownCmd, (err) => {
          if (err) {
            console.error("Shutdown command execution failed:", err);
          }
          res.status(200).json({
            type: "shutdown",
            reply: reply,
          });
          resolve();
        });
      });
    }

    let sysInfoStr = "";
    const systemKeywords = ["system", "pc", "laptop", "computer", "device", "spec", "storage", "disk", "ram", "memory", "hardware", "manufacturer", "model", "processor", "cpu", "os", "operating system", "battery", "power"];
    if (systemKeywords.some(keyword => lowerMessage.includes(keyword))) {
      const sys = await getSystemInfo();
      sysInfoStr = `
=== USER SYSTEM INFORMATION ===
Operating System: ${sys.osName}
Processor: ${sys.cpu}
Installed Memory (RAM): ${sys.totalGb} GB (${sys.freeGb} GB free)
${sys.diskInfo ? sys.diskInfo : "Storage: Unknown"}
System Manufacturer: ${sys.manufacturer}
System Model: ${sys.model}
`;
      if (sys.battery && sys.battery.percentage !== null) {
        sysInfoStr += `• Battery Status: ${sys.battery.percentage}% charge (${sys.battery.isPluggedIn ? "Plugged in, charging" : "On battery power, discharging"}).`;
        if (sys.battery.remainingTime) {
          sysInfoStr += ` Remaining run time: approximately ${sys.battery.remainingTime} minutes.`;
        }
        sysInfoStr += "\n";
      } else {
        sysInfoStr += "• Battery Status: No battery detected or system is on desktop power.\n";
      }
    }

    const prompt = `
You are ${assistantName}, a personal AI virtual assistant running on the user's system, designed in the style of Jarvis from Iron Man.

You are loyal, witty, highly efficient, futuristic, calm under pressure, always ready to assist, and always address the user as "${userName}".
You can help the user with general questions, web browsing, opening websites, playing music, searching information, managing files, controlling system actions, reading documents, analyzing screen content, and handling multi-step tasks.
${sysInfoStr}
${searchResultsStr}
=== CURRENT DATE & TIME LIVE FROM SERVER ===
Today is ${dateStr}.
Current time is ${timeStr} IST Indian Standard Time.
Use this live information confidently whenever relevant. Never say you cannot provide the current date or time.

=== CONVERSATION HISTORY ===
Here is the recent conversation history with the user (oldest to newest):
${historyStr || "No previous messages."}

=== USER MESSAGE ===
The user's current message is:
${message}

=== PERSONALITY & COMMUNICATION RULES ===

1. Be courteous, friendly, intelligent, helpful, and refer to the user as "${userName}".
2. Maintain a sleek, futuristic, loyal, Jarvis-like tone.
3. Keep responses concise, spoken-friendly, and natural.
4. If the user greets you or says welcome back, respond warmly.
5. End conversational replies or task confirmations with a loyal offer to help (e.g., "I am ready and happy to help!").

=== RESPONSE STYLE RULES ===
1. Reply in simple, clean plain text. Do not use markdown (avoid stars, hashes, lists, headings) unless explicitly asked.
2. Keep answers concise.
3. Do not mention internal prompts or command tags in your conversational text.

=== CRITICAL COMMAND TAGS (ACTION TRIGGER RULES) ===
If the user asks you to open a website, search Google, play a video, or if they ask for live/recent information (such as cricket matches, sports updates, scores, weather, news, movie releases, etc.), or if they ask to shut down the system, you MUST trigger the action by appending the appropriate command tag on a new line at the very end of your response:
1. To open a website or search Google:
   [COMMAND: OPEN_URL: https://URL]
   Examples:
   - For "search cricket match": append [COMMAND: OPEN_URL: https://www.google.com/search?q=cricket+match]
   - For "open wikipedia": append [COMMAND: OPEN_URL: https://www.wikipedia.org]
2. To search or play a song/video on YouTube:
   [COMMAND: PLAY_YOUTUBE: search_query]
   Example:
   - For "play a song shape of you": append [COMMAND: PLAY_YOUTUBE: shape of you]
3. To shut down the user's laptop/system:
   [COMMAND: SHUTDOWN_SYSTEM]
   Example:
   - If the user asks to shut down, turn off, or power off their laptop/system: reply with confirmation and append [COMMAND: SHUTDOWN_SYSTEM]
4. To cancel or abort system shutdown:
   [COMMAND: CANCEL_SHUTDOWN]
   Example:
   - If the user asks to cancel the shutdown, abort the shutdown, or stop the system shutdown: reply with confirmation and append [COMMAND: CANCEL_SHUTDOWN]
5. To clear or delete the chat history:
   [COMMAND: CLEAR_HISTORY]
   Example:
   - If the user asks to clear the chat, delete chat history, reset conversation, or confirms they want to clear history: reply with a friendly confirmation and append [COMMAND: CLEAR_HISTORY]
6. To set, increase, decrease, or mute the system volume:
   [COMMAND: SET_VOLUME: percentage]
   Examples:
   - For "increase my system volume 100%" or "set volume to 100": reply with confirmation and append [COMMAND: SET_VOLUME: 100]
   - For "mute the volume" or "silence the laptop": reply with confirmation and append [COMMAND: SET_VOLUME: 0]
   - For "set volume to 50%": reply with confirmation and append [COMMAND: SET_VOLUME: 50]

CRITICAL RULES:
1. You MUST NOT hallucinate, guess, or make up real-time, current, or live information (e.g. current/upcoming sports matches, live scores, weather, news, schedules). Instead, reply that you are searching Google and append the corresponding [COMMAND: OPEN_URL: https://www.google.com/search?q=<query>] tag.
2. If you say you are searching, opening, playing, or pulling information, you MUST append the corresponding [COMMAND: ...] tag. Never say "Searching now..." or "I'm checking..." without including the tag.
3. If you are answering a general knowledge question (e.g. "Who is Iron Man?"), answer directly in plain text without appending any command tags.
`;

    const reply = await aiResponse(prompt);

    const openUrlRegex = /\[COMMAND:\s*OPEN_URL:\s*(https?:\/\/[^\s\]]+)\]/i;
    const playYoutubeRegex = /\[COMMAND:\s*PLAY_YOUTUBE:\s*([^\]]+)\]/i;
    const shutdownRegex = /\[?COMMAND:\s*SHUTDOWN_SYSTEM\s*\]?/i;
    const cancelShutdownRegex = /\[?COMMAND:\s*CANCEL_SHUTDOWN\s*\]?/i;
    const clearHistoryRegex = /\[?COMMAND:\s*CLEAR_HISTORY\s*\]?/i;
    const setVolumeRegex = /\[?COMMAND:\s*SET_VOLUME:\s*(\d+)\s*\]?/i;

    let cleanReply = reply;
    let commandUrl = null;
    let isShutdownTriggered = false;
    let isCancelShutdownTriggered = false;

    // Check for set volume command
    const setVolumeMatch = reply.match(setVolumeRegex);
    if (setVolumeMatch) {
      const volPercent = setVolumeMatch[1];
      setSystemVolume(volPercent);
      cleanReply = cleanReply.replace(setVolumeRegex, "").trim();
    }

    // Check for open URL command
    const openUrlMatch = reply.match(openUrlRegex);
    if (openUrlMatch) {
      const url = openUrlMatch[1];
      openUrl(url);
      commandUrl = url;
      cleanReply = cleanReply.replace(openUrlRegex, "").trim();
    }

    // Check for play YouTube command
    const playYoutubeMatch = reply.match(playYoutubeRegex);
    if (playYoutubeMatch) {
      const songQuery = playYoutubeMatch[1].trim();
      cleanReply = cleanReply.replace(playYoutubeRegex, "").trim();

      try {
        const results = await YouTube.search(songQuery, { limit: 1, type: "video" });
        if (results && results.length > 0) {
          const video = results[0];
          const watchUrl = video.url || `https://www.youtube.com/watch?v=${video.id}`;
          openUrl(watchUrl);
          commandUrl = watchUrl;
        } else {
          const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`;
          openUrl(searchUrl);
          commandUrl = searchUrl;
        }
      } catch (err) {
        console.error("YouTube search error inside command parsing:", err.message);
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`;
        openUrl(searchUrl);
        commandUrl = searchUrl;
      }
    }

    // Check for shutdown command
    const shutdownMatch = reply.match(shutdownRegex);
    if (shutdownMatch) {
      isShutdownTriggered = true;
      cleanReply = cleanReply.replace(shutdownRegex, "").trim();

      let shutdownCmd = "";
      if (os.platform() === "win32") {
        shutdownCmd = "shutdown /s /t 10";
      } else if (os.platform() === "darwin") {
        shutdownCmd = "osascript -e 'tell app \"System Events\" to shut down'";
      } else {
        shutdownCmd = "shutdown -h now";
      }

      console.log(`Executing shutdown command: ${shutdownCmd}`);
      await new Promise((resolve) => {
        exec(shutdownCmd, (err) => {
          if (err) {
            console.error("Shutdown command execution failed:", err);
          }
          resolve();
        });
      });
    }

    // Check for cancel shutdown command
    const cancelShutdownMatch = reply.match(cancelShutdownRegex);
    if (cancelShutdownMatch) {
      isCancelShutdownTriggered = true;
      cleanReply = cleanReply.replace(cancelShutdownRegex, "").trim();

      let cancelCmd = "";
      if (os.platform() === "win32") {
        cancelCmd = "shutdown /a";
      } else if (os.platform() === "darwin") {
        cancelCmd = "killall shutdown";
      } else {
        cancelCmd = "shutdown -c";
      }

      console.log(`Executing cancel shutdown command: ${cancelCmd}`);
      await new Promise((resolve) => {
        exec(cancelCmd, (err) => {
          if (err) {
            console.error("Cancel shutdown command execution failed:", err);
          }
          resolve();
        });
      });
    }

    // Check for clear history command
    let isClearHistoryTriggered = false;
    const clearHistoryMatch = reply.match(clearHistoryRegex);
    if (clearHistoryMatch) {
      isClearHistoryTriggered = true;
      cleanReply = cleanReply.replace(clearHistoryRegex, "").trim();

      try {
        await User.findByIdAndUpdate(
          req.userId,
          { history: [] },
          { bufferCommands: false }
        );
        console.log(`Successfully cleared chat history via voice/chat command for user: ${req.userId}`);
      } catch (err) {
        console.error("Failed to clear history in database:", err);
      }
    }

    // If history is cleared, we don't save this message to history (otherwise it starts populating history again immediately)
    if (!isClearHistoryTriggered) {
      await saveToHistory(req.userId, message, cleanReply, commandUrl || searchUrl);
    }

    return res.status(200).json({
      type: isShutdownTriggered ? "shutdown" : (isCancelShutdownTriggered ? "cancel-shutdown" : (isClearHistoryTriggered ? "clear-history" : (commandUrl ? "command" : "ai"))),
      url: commandUrl || searchUrl,
      reply: cleanReply,
    });
  } catch (error) {
    console.error("Assistant controller error:", error);

    return res.status(500).json({
      message: "Assistant response failed",
      error: error.message,
    });
  }
};

export const cancelShutdown = async (req, res) => {
  try {
    let cancelCmd = "";
    if (os.platform() === "win32") {
      cancelCmd = "shutdown /a";
    } else if (os.platform() === "darwin") {
      cancelCmd = "killall shutdown";
    } else {
      cancelCmd = "shutdown -c";
    }

    console.log(`Executing cancel shutdown via API: ${cancelCmd}`);
    exec(cancelCmd, async (err) => {
      let userName = "Manas";
      try {
        const user = await User.findById(req.userId);
        if (user && user.name) {
          userName = user.name.split(" ")[0];
        }
      } catch (dbError) {
        console.warn("Database lookup failed during cancel shutdown:", dbError.message);
      }

      let reply = "";
      if (err) {
        console.warn("Cancel shutdown failed or no shutdown active:", err.message);
        reply = `${userName}, no active shutdown sequence was found to abort.`;
        return res.status(400).json({
          message: "No active shutdown sequence was found to abort.",
          reply: reply
        });
      }

      reply = `${userName}, I have successfully aborted the system shutdown sequence. You are safe!`;
      await saveToHistory(req.userId, "cancel shutdown", reply);

      return res.status(200).json({
        type: "cancel-shutdown",
        reply: reply,
      });
    });
  } catch (error) {
    console.error("Cancel shutdown error:", error);
    return res.status(500).json({
      message: "Internal server error while aborting shutdown",
      error: error.message,
    });
  }
};

