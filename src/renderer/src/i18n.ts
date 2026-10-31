import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'

// Every visible word comes from a dictionary file in ./locales.
// Adding Arabic later = add ar.json; the page direction follows the language.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

function applyDirection(lng: string): void {
  document.documentElement.lang = lng
  document.documentElement.dir = i18n.dir(lng)
}

applyDirection(i18n.language)
i18n.on('languageChanged', applyDirection)

export default i18n
