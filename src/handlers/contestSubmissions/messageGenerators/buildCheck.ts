import { AttachmentBuilder } from "discord.js";
import type { MessageCreateOptions } from "discord.js";
import type { ContestSubmissionDocument } from "../../../database/models/ContestSubmission.model";
import Emojis from "../../../constants/emojis";
import { generateSubmissionEmbeds } from ".";

const maxImagesPerSubmission = 6;
const defaultImageExtension = ".png";

function getFileExtension(url: string, contentType: string | null): string {
  const urlPath = url.split("?")[0] ?? "";
  const match = urlPath.match(/\.(png|jpe?g|gif|webp)$/i);
  const extensionFromUrl = match?.[1]?.toLowerCase();
  if (extensionFromUrl) return `.${extensionFromUrl}`;

  switch (contentType?.toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    default:
      return defaultImageExtension;
  }
}

async function buildAttachments(urls: string[]): Promise<AttachmentBuilder[]> {
  const attachments: AttachmentBuilder[] = [];
  for (const [index, url] of urls.entries()) {
    const response = await fetch(url).catch(() => null);
    if (!response || !response.ok) continue;
    const extension = getFileExtension(url, response.headers.get("content-type"));
    const buffer = Buffer.from(await response.arrayBuffer());
    attachments.push(new AttachmentBuilder(buffer, { name: `botm-${index + 1}${extension}` }));
  }
  return attachments;
}

export default async function generateBuildCheckMessage(submission: ContestSubmissionDocument): Promise<MessageCreateOptions> {
  const coordinates = submission.buildCoordinates?.trim() || "Not provided";
  const imageUrls = (submission.submissionImages ?? [])
    .filter(Boolean)
    .slice(0, maxImagesPerSubmission);
  const attachments = imageUrls.length ? await buildAttachments(imageUrls) : [];

  return {
    content: [
      `${Emojis.SPARKLE} Build check for <@${submission.authorId}>.`,
      `Coordinates: ${coordinates}`,
    ].join("\n"),
    ...(attachments.length
      ? { files: attachments }
      : { embeds: generateSubmissionEmbeds(submission) }),
    allowedMentions: { users: [submission.authorId] },
  };
}
