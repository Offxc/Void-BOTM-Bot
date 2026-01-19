import type { MessageCreateOptions } from "discord.js";
import type { ContestSubmissionDocument } from "../../../database/models/ContestSubmission.model";
import Emojis from "../../../constants/emojis";
import { generateSubmissionEmbeds } from ".";

const maxImagesPerSubmission = 6;

export default function generateWinnerMessage(placement: string, submission: ContestSubmissionDocument): MessageCreateOptions {
  const coordinates = submission.buildCoordinates?.trim();
  const files = (submission.submissionImages?.length ? submission.submissionImages : [submission.submission])
    .filter(Boolean)
    .slice(0, maxImagesPerSubmission);
  const lines = [
    `${Emojis.TADA} ${placement} place - <@${submission.authorId}>.`,
  ];

  if (coordinates) {
    lines.push(`Coordinates: ${coordinates}`);
  }

  return {
    content: lines.join("\n"),
    ...(files.length ? { files } : { embeds: generateSubmissionEmbeds(submission) }),
    allowedMentions: { users: [submission.authorId] },
  };
}
