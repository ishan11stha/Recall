import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const REMINDER_IDENTIFIER = 'recall-daily-review-reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function configureDailyReviewReminder(
  enabled: boolean,
  timeHHMM: string
): Promise<{ granted: boolean; scheduled: boolean }> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER).catch(() => {});
    if (!enabled) {
      return { granted: true, scheduled: false };
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      finalStatus = req.status;
    }

    if (finalStatus !== 'granted') {
      return { granted: false, scheduled: false };
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('daily-review', {
        name: 'Daily Review Reminder',
        importance: 3, // AndroidImportance.DEFAULT
      });
    }

    const [hourStr, minStr] = timeHHMM.split(':');
    const hour = Math.min(23, Math.max(0, Number.parseInt(hourStr ?? '9', 10) || 9));
    const minute = Math.min(59, Math.max(0, Number.parseInt(minStr ?? '0', 10) || 0));

    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_IDENTIFIER,
      content: {
        title: 'RECALL — Daily Review',
        body: 'Your due flashcards are ready for spaced repetition.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: Platform.OS === 'android' ? 'daily-review' : undefined,
      },
    });

    return { granted: true, scheduled: true };
  } catch {
    return { granted: false, scheduled: false };
  }
}
