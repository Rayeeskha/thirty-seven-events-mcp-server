import { MarketingChannel, MarketingContext } from '../marketing.types';
import { ComposedMessage } from './en';

const SIGN_OFF = 'مع أطيب التحيات،\nThirty Seven Events';

function instagram(ctx: MarketingContext): ComposedMessage {
  if (ctx.status === 'COMPLETED') {
    return {
      body: [
        `شكراً لكل من شاركنا في ${ctx.eventName} الذي أُقيم بتاريخ ${ctx.dateLabel}.`,
        `من تنظيم Thirty Seven Events لصالح ${ctx.client}.`,
        'نتطلع إلى لقائكم في فعاليتنا القادمة.',
        ctx.hashtags,
      ].join('\n\n'),
    };
  }
  const preparations = ctx.status === 'IN_PROGRESS' ? ' التحضيرات جارية.' : '';
  return {
    body: [
      `📅 احفظوا الموعد: ${ctx.eventName}`,
      `ندعوكم لحضور الفعالية بتاريخ ${ctx.dateLabel}. من تنظيم Thirty Seven Events لصالح ${ctx.client}.${preparations}`,
      'نتطلع إلى استقبالكم.',
      ctx.hashtags,
    ].join('\n\n'),
  };
}

function email(ctx: MarketingContext): ComposedMessage {
  if (ctx.status === 'COMPLETED') {
    return {
      subject: `شكراً لمشاركتكم في ${ctx.eventName}`,
      body: [
        'ضيوفنا الكرام،',
        `نشكر كل من شاركنا في ${ctx.eventName} الذي أُقيم بتاريخ ${ctx.dateLabel}. الفعالية من تنظيم Thirty Seven Events لصالح ${ctx.client}.`,
        'نتطلع إلى لقائكم في فعاليتنا القادمة.',
        SIGN_OFF,
      ].join('\n\n'),
    };
  }
  const preparations = ctx.status === 'IN_PROGRESS' ? ' التحضيرات جارية.' : '';
  return {
    subject: `احفظوا الموعد: ${ctx.eventName} بتاريخ ${ctx.dateLabel}`,
    body: [
      'ضيوفنا الكرام،',
      `يسعدنا دعوتكم لحضور ${ctx.eventName}، وذلك بتاريخ ${ctx.dateLabel}.`,
      `الفعالية من تنظيم Thirty Seven Events لصالح ${ctx.client}.${preparations}`,
      'نتطلع إلى استقبالكم.',
      SIGN_OFF,
    ].join('\n\n'),
  };
}

export function composeArabic(ctx: MarketingContext, channel: MarketingChannel): ComposedMessage {
  return channel === 'EMAIL' ? email(ctx) : instagram(ctx);
}
