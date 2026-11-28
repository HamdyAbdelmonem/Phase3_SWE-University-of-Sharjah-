/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { session } from "@web/session";
import { browser } from "@web/core/browser/browser";

// =========================================================
// NEXUS - TOUR OPERATOR BOOKING SUITE
// Global Light / Dark Theme Controller
// =========================================================

const LIGHT_THEME = "light";
const DARK_THEME = "dark";

const THEME_ATTRIBUTE = "data-nexus-theme";

// =========================================================
// 01. THEME PREFERENCE STORAGE
// =========================================================

function getStorageKey() {
    return [
        "nexus.theme",
        session.db,
        user.userId,
    ].join(":");
}

function loadTheme() {
    try {
        const savedTheme = browser.localStorage.getItem(
            getStorageKey()
        );

        return savedTheme === DARK_THEME
            ? DARK_THEME
            : LIGHT_THEME;

    } catch (error) {
        console.warn(
            "Nexus: Unable to load theme preference.",
            error
        );

        return LIGHT_THEME;
    }
}

function saveTheme(theme) {
    try {
        browser.localStorage.setItem(
            getStorageKey(),
            theme
        );

    } catch (error) {
        console.warn(
            "Nexus: Unable to save theme preference.",
            error
        );
    }
}

// =========================================================
// 02. GLOBAL THEME APPLICATION
// =========================================================

function applyTheme(theme) {
    const validTheme =
        theme === DARK_THEME
            ? DARK_THEME
            : LIGHT_THEME;

    document.documentElement.setAttribute(
        THEME_ATTRIBUTE,
        validTheme
    );

    return validTheme;
}

// =========================================================
// 03. NEXUS THEME SWITCH COMPONENT
// =========================================================

export class NexusThemeSwitch extends Component {

    static template = "tour_operator_booking.NexusThemeSwitch";

    static props = {};

    setup() {

        const initialTheme = loadTheme();

        this.state = useState({
            theme: initialTheme,
        });

        applyTheme(initialTheme);
    }

    // =====================================================
    // 04. CURRENT THEME STATE
    // =====================================================

    get isDark() {
        return this.state.theme === DARK_THEME;
    }

    get currentThemeLabel() {
        return this.isDark
            ? "Dark Mode"
            : "Light Mode";
    }

    get toggleLabel() {
        return this.isDark
            ? "Switch to Light Mode"
            : "Switch to Dark Mode";
    }

    // =====================================================
    // 05. SWITCH BETWEEN LIGHT AND DARK MODE
    // =====================================================

    toggleTheme() {

        const nextTheme = this.isDark
            ? LIGHT_THEME
            : DARK_THEME;

        this.state.theme = applyTheme(nextTheme);

        saveTheme(this.state.theme);
    }
}

// =========================================================
// 06. REGISTER TOP-RIGHT ODOO NAVIGATION SWITCH
// =========================================================

registry.category("systray").add(
    "tour_operator_booking.nexus_theme",
    {
        Component: NexusThemeSwitch,
    },
    {
        sequence: 60,
    }
);