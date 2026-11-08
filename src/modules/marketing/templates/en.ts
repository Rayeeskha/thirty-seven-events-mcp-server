import { MarketingChannel, MarketingContext } from '../marketing.types';

export interface ComposedMessage {
  subject?: string;
  body: string;
}

const SIGN_OFF = 'Warm regards,\nThirty Seven Events';

function instagram(ctx: MarketingContext): ComposedMessage {
  if (ctx.status === 'COMPLETED') {
    return {
      body: [
        `Thank you to everyone who joined us at ${ctx.eventName} on ${ctx.dateLabel}.`,
        `Produced by Thirty Seven Events for ${ctx.client}.`,
        'We look forward to seeing you at our next event.',
        ctx.hashtags,
      ].join('\n\n'),
    };
  }
  const preparations = ctx.status === 'IN_PROGRESS' ? ' Preparations are underway.' : '';
  return {
    body: [
      `📅 Save the date: ${ctx.eventName}`,
      `Join us on ${ctx.dateLabel}. Produced by Thirty Seven Events for ${ctx.client}.${preparations}`,
      'We look forward to welcoming you.',
      ctx.hashtags,
    ].join('\n\n'),
  };
}

function email(ctx: MarketingContext): ComposedMessage {
  if (ctx.status === 'COMPLETED') {
    return {
      subject: `Thank you for being part of ${ctx.eventName}`,
      body: [
        'Dear guest,',
        `Thank you to everyone who joined us at ${ctx.eventName}, held on ${ctx.dateLabel}. The event was produced by Thirty Seven Events for ${ctx.client}.`,
        'We look forward to seeing you at our next event.',
        SIGN_OFF,
      ].join('\n\n'),
    };
  }
  const preparations = ctx.status === 'IN_PROGRESS' ? ' Preparations are underway.' : '';
  return {
    subject: `Save the date: ${ctx.eventName} on ${ctx.dateLabel}`,
    body: [
      'Dear guest,',
      `We are pleased to invite you to ${ctx.eventName}, taking place on ${ctx.dateLabel}.`,
      `The event is produced by Thirty Seven Events for ${ctx.client}.${preparations}`,
      'We look forward to welcoming you.',
      SIGN_OFF,
    ].join('\n\n'),
  };
}

export function composeEnglish(ctx: MarketingContext, channel: MarketingChannel): ComposedMessage {
  return channel === 'EMAIL' ? email(ctx) : instagram(ctx);
}
