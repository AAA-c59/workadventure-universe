import type { BaseTranslation } from "../i18n-types";

const install: BaseTranslation = {
    // The row in the profile menu, under Settings
    menuRow: "Install app",
    menuRowHint: "Universe on your home screen",
    // The small card shown once
    card: {
        title: "Get the Universe app",
        text: "Opens in one tap, full screen.",
        install: "Install",
        close: "Don't show this again",
    },
    // The note after the browser's own Install
    installed: "Universe is on your home screen",
    guide: {
        close: "Close",
        // Steps, in the words of the browser: bold parts are the buttons to tap
        iphoneSafari: {
            title: "Add Universe to your Home Screen",
            step1: "Tap <b>⋯</b> in Safari's bar below. Older iPhones: tap Share.",
            step2: "Tap <b>Share</b>, then <b>Add to Home Screen</b>.",
            step3: "Keep <b>Open as Web App</b> on, then tap <b>Add</b>.",
        },
        ipadSafari: {
            title: "Add Universe to your Home Screen",
            step1: "Tap <b>Share</b> at the top right of Safari.",
            step2: "Scroll down and tap <b>Add to Home Screen</b>.",
            step3: "Keep <b>Open as Web App</b> on, then tap <b>Add</b>.",
        },
        iosChrome: {
            title: "Add Universe to your Home Screen",
            step1: "Tap <b>Share</b> at the top right of Chrome.",
            step2: "Scroll down and tap <b>Add to Home Screen</b>.",
            step3: "Keep <b>Open as Web App</b> on, then tap <b>Add</b>.",
        },
        addToHomeScreen: "Add to Home Screen",
        // Safari cannot tell whether the app is already there, so the sheet says where to find it
        alreadyAdded: "Already added? Open Universe from your Home Screen.",
        openInSafari: {
            title: "Open Universe in Safari to install it",
            text: "This app's own browser can't add apps to your Home Screen. Copy the link, open Safari and paste it.",
            copy: "Copy link",
            copied: "Link copied",
            notNow: "Not now",
        },
        // After the browser's own install window was cancelled: it cannot open twice, so point at the browser's menu
        browserMenu: {
            title: "Install Universe from your browser's menu",
            androidStep1: "Tap <b>⋮</b> at the top right of your browser.",
            androidStep2: "Tap <b>Install app</b>, then <b>Install</b>.",
            desktopStep1: "Click <b>⋮</b> at the top right of your browser.",
            desktopStep2:
                "Choose <b>Install Universe</b>. In Edge: <b>Apps</b>, then <b>Install this site as an app</b>.",
            gotIt: "Got it",
        },
        macSafari: {
            title: "Add Universe to your Dock",
            step1: "Click <b>File</b> in the menu bar at the top.",
            step2: "Click <b>Add to Dock</b>, then <b>Add</b>.",
            gotIt: "Got it",
        },
    },
};

export default install;
