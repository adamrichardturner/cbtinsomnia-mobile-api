export interface AdviceArticle {
  slug: string
  title: string
  summary: string
  category: 'foundations' | 'window' | 'night' | 'mind' | 'days'
  body: string[]
}

export const ADVICE_ARTICLES: AdviceArticle[] = [
  {
    slug: 'sleep-is-not-a-switch',
    title: 'Sleep is not an on/off switch',
    summary: 'Sleep is a process. Trying to force it usually keeps you more awake.',
    category: 'foundations',
    body: [
      'Sleep is often pictured as something you turn on. In practice it is a process: your body winds down, then cycles through lighter and deeper stages through the night.',
      'People with insomnia often put extra effort into “making sleep happen”. That effort is understandable, and it usually backfires. Arousal and sleep do not sit comfortably together.',
      'A more useful stance is to set the conditions — a regular rise time, a protected window, a bed that means sleep — and allow sleep to arrive rather than chasing it.',
    ],
  },
  {
    slug: 'protect-the-window',
    title: 'Protect a sleep window',
    summary: 'Match time in bed more closely to the sleep you are actually getting.',
    category: 'window',
    body: [
      'If you spend much longer in bed than you sleep, the bed becomes a place of waiting. Sleep efficiency — sleep time divided by time in bed — is the figure CBT-I uses to keep the window honest.',
      'A typical starting window is built from your recent average sleep, with a floor around five hours so the plan stays safe. You do not go to bed before the threshold time, and you get up at the same rising time every day, including weekends.',
      'When efficiency is steadily high (around 90% or more), the window can grow by a small step — about 15 minutes — rather than jumping back to old hours in bed.',
    ],
  },
  {
    slug: 'same-rise-time',
    title: 'The same rise time, most days',
    summary: 'A regular getting-up time is the strongest anchor in a sleep plan.',
    category: 'window',
    body: [
      'Lie-ins feel kind after a poor night. They also slide your body clock later and make the next night harder.',
      'Pick a rise time you can keep on workdays and days off. Get up then even after a broken night. Morning light and movement help the clock reset.',
      'This is the habit to protect first. Bedtime can flex a little with sleepiness; rising time should not.',
    ],
  },
  {
    slug: 'bed-for-sleep',
    title: 'The bed is for sleep',
    summary: 'Stimulus control: keep wakeful life out of the bed so the bed means sleep again.',
    category: 'night',
    body: [
      'Over time, the bed can become linked with worry, scrolling, planning, or watching the clock. The body then treats the bedroom as a place to be alert.',
      'Use the bed for sleep (and intimacy), not for work, news, or long conversations. If you are awake for a while and no longer sleepy, get up, keep the lights low, do something calm, and return only when sleepiness comes back.',
      'This “quarter-hour rule” is a guideline, not a stopwatch. The point is to leave the struggle, not to monitor another clock.',
    ],
  },
  {
    slug: 'sleepy-not-tired',
    title: 'Go to bed sleepy, not just tired',
    summary: 'Tiredness is worn-out. Sleepiness is the body asking for sleep.',
    category: 'night',
    body: [
      'Tiredness can be heavy limbs, irritability, or “I’ve had enough”. Sleepiness looks more like itchy eyes, yawning, nodding, or losing the thread of a page.',
      'Going to bed tired-but-wired is a common trap. Wait for sleepiness, even if that means staying up a little later than the threshold time.',
      'The threshold is the earliest you may go to bed — not a curfew you must meet.',
    ],
  },
  {
    slug: 'wind-down',
    title: 'A short wind-down beats a perfect routine',
    summary: 'Give the day a landing strip of 20–40 minutes.',
    category: 'days',
    body: [
      'A wind-down is a few repeatable, low-demand steps that tell the nervous system the day is closing: dimmer light, a warm shower, reading, stretching, or a quiet audio story.',
      'Keep it ordinary. An elaborate ritual becomes another thing to get right, and another thing to blame when sleep is poor.',
      'Put unfinished tasks on paper earlier in the evening so they are less likely to arrive as you switch the light off.',
    ],
  },
  {
    slug: 'caffeine-alcohol-naps',
    title: 'Caffeine, alcohol, and naps',
    summary: 'Small daytime choices that often show up in the diary.',
    category: 'days',
    body: [
      'Caffeine can linger for many hours. Moving the last cup earlier is often more realistic than quitting overnight.',
      'Alcohol may help you drop off and then fragment the second half of the night. If you drink, treat it as data in the diary rather than a sleep aid.',
      'Long or late naps steal from the night’s sleep drive. If you need a nap for safety, keep it short and earlier in the day.',
    ],
  },
  {
    slug: 'clock-watching',
    title: 'Stop feeding the clock',
    summary: 'Checking the time at night usually increases arousal.',
    category: 'mind',
    body: [
      'Each glance at the clock invites a calculation: how little is left, how bad tomorrow will be, how “behind” you are. That is a reliable way to stay awake.',
      'Turn the clock away, leave the phone in another room, or cover the time display. Estimate the night in the morning diary instead.',
      'If you already remember a chain of clock-watching, map it in the daytime. Night-time is not the moment to analyse it.',
    ],
  },
  {
    slug: 'racing-mind',
    title: 'When the mind will not settle',
    summary: 'Park the day, use imagery, and drop the effort to force sleep.',
    category: 'mind',
    body: [
      'A racing mind is common in insomnia. Trying harder to blank it usually turns up the volume.',
      'Earlier in the evening, put the day to rest: what happened, what still needs a first step, what can wait. At night, a calm imagery scene — a familiar walk, a quiet room — gives attention somewhere gentle to land.',
      'Paradoxically, giving up the struggle (“I will rest; sleep can come or not”) often lets sleep arrive. Sleep is not an achievement to win.',
    ],
  },
  {
    slug: 'one-poor-night',
    title: 'One poor night is information, not failure',
    summary: 'Setbacks are part of changing a long-standing pattern.',
    category: 'foundations',
    body: [
      'A run of better nights will be interrupted. Travel, stress, illness, or a late event can open an old pattern without undoing the work you have already done.',
      'Reinstate the basics first: rise time, window, bed for sleep, no clock-watching. You do not need to restart from week one.',
      'If daytime sleepiness becomes unsafe — especially while driving — pause the tighter window and seek proper advice. This app is a coach, not medical care.',
    ],
  },
]
