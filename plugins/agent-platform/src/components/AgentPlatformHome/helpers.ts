function partOfDay(hour: number): string {
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 18) {
    return 'afternoon';
  }
  return 'evening';
}

/** "Good morning, Jane": the part of the day, and the display name's first word. */
export function greeting(date: Date, displayName?: string): string {
  const firstName = displayName?.trim().split(/\s+/)[0];
  const salutation = `Good ${partOfDay(date.getHours())}`;
  return firstName ? `${salutation}, ${firstName}` : salutation;
}
