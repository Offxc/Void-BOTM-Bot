import type { MessageCreateOptions } from "discord.js";
import type { ContestSubmissionDocument } from "../../../database/models/ContestSubmission.model";
import Emojis from "../../../constants/emojis";
import { generateSubmissionEmbeds } from ".";

export default function generateBuildCheckMessage(submission: ContestSubmissionDocument): MessageCreateOptions {
  const coordinates = submission.buildCoordinates?.trim() || "Not provided";

  return {
    content: [
      `${Emojis.SPARKLE} Build check for <@${submission.authorId}>.`,
      `Coordinates: ${coordinates}`,
    ].join("\n"),
    embeds: generateSubmissionEmbeds(submission),
    allowedMentions: { users: [submission.authorId] },
  };
}
