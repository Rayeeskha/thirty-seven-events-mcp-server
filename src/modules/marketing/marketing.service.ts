import { EventService } from "../events/event.service";
import { EventDto } from "../events/event.types";
import { ERROR_MESSAGES } from "../../config/messages";
import { ValidationError } from "../../utils/errors";
import {
  DraftLanguage,
  MarketingChannel,
  MarketingContext,
  MarketingDraft,
  MarketingDraftResult,
  MarketingLanguage,
} from "./marketing.types";
import { composeArabic } from "./templates/ar";
import { buildMarketingContext } from "./templates/context";
import { ComposedMessage, composeEnglish } from "./templates/en";

const COMPOSERS: Record<
  DraftLanguage,
  (ctx: MarketingContext, channel: MarketingChannel) => ComposedMessage
> = {
  EN: composeEnglish,
  AR: composeArabic,
};

const LANGUAGES_BY_SELECTION: Record<MarketingLanguage, DraftLanguage[]> = {
  EN: ["EN"],
  AR: ["AR"],
  BOTH: ["EN", "AR"],
};

export interface DraftMarketingRequest {
  channel: MarketingChannel;
  language: MarketingLanguage;
}

function assertPromotable(
  event: EventDto,
): asserts event is EventDto & { status: MarketingContext["status"] } {
  if (event.status === "CANCELLED") {
    throw new ValidationError(ERROR_MESSAGES.marketingCancelled, [
      {
        path: "event_id",
        message: ERROR_MESSAGES.marketingCancelledDetail(event.id),
      },
    ]);
  }
}

export class MarketingService {
  constructor(private readonly eventService: EventService) {}

  async draftMessage(
    eventId: number,
    request: DraftMarketingRequest,
  ): Promise<MarketingDraftResult> {
    const event = await this.eventService.getEventById(eventId);
    assertPromotable(event);

    const drafts: MarketingDraft[] = LANGUAGES_BY_SELECTION[
      request.language
    ].map((language) => ({
      language,
      channel: request.channel,
      ...COMPOSERS[language](
        buildMarketingContext(event, language),
        request.channel,
      ),
    }));

    return {
      event_id: event.id,
      event_name: event.event_name,
      event_status: event.status,
      channel: request.channel,
      drafts,
    };
  }
}
