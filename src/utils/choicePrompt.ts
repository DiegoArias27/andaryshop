/** The toast text for a "choose your color/size first" nudge — pairs with
 * the shake+illuminate highlight on the option that's still missing. */
export function choicePromptMessage(needsColor: boolean, needsSize: boolean): string | null {
  if (needsColor && needsSize) return 'Elige un color y una talla'
  if (needsColor) return 'Elige un color'
  if (needsSize) return 'Elige una talla'
  return null
}
