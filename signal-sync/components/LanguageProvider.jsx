'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getTranslation } from '@/lib/i18n';

const LanguageContext = createContext({ lang: 'en', setLang: () => {}, t: (k) => k, ready: false });

export function LanguageProvider({ children }) {
    const [lang, setLangState] = useState('en');
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('signalsync_lang');
        if (stored) setLangState(stored);
        setReady(true);
    }, []);

    function setLang(l) {
        setLangState(l);
        localStorage.setItem('signalsync_lang', l);
    }

    const strings = getTranslation(lang);

    function t(key, ...args) {
        const val = strings[key];
        if (typeof val === 'function') return val(...args);
        return val !== undefined ? val : key;
    }

    return (
        <LanguageContext.Provider value={{ lang, setLang, t, ready }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    return useContext(LanguageContext);
}
