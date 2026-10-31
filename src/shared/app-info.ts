// The app's name lives in one place: `productName` in package.json.
// Renaming the app means changing that one field.
import { productName } from '../../package.json'

export const APP_NAME: string = productName
