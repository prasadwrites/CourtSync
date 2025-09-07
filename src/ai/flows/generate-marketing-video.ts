
'use server';
/**
 * @fileOverview A marketing video generation AI agent.
 *
 * - generateMarketingVideo - A function that handles the marketing video generation process.
 * - GenerateMarketingVideoOutput - The return type for the generateMarketingVideo function.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';
import { MediaPart } from 'genkit';

const GenerateMarketingVideoOutputSchema = z.object({
  videoDataUri: z
    .string()
    .describe("The generated marketing video as a data URI. Expected format: 'data:video/mp4;base64,<encoded_data>'."),
});
export type GenerateMarketingVideoOutput = z.infer<typeof GenerateMarketingVideoOutputSchema>;


export async function generateMarketingVideo(): Promise<GenerateMarketingVideoOutput> {
  return generateMarketingVideoFlow();
}

const prompt = `A dynamic and engaging marketing video for a platform called CourtSync, under 1 minute.
The video should be cinematic, with modern, clean visuals and upbeat background music.
It should showcase the following features:
- **Effortless Booking:** Show a user easily booking a tennis court on their smartphone. Visuals of the app interface, calendar, and a satisfying confirmation checkmark.
- **User Management:** Illustrate an administrator managing user profiles and roles on a dashboard.
- **Credit System:** Show a user purchasing credits and using them to book a court.
- **AI-Powered Recommendations:** A visual of the AI suggesting available courts to a user.
The video should end with the CourtSync logo and the tagline: "CourtSync: Streamline your court bookings and management."`;


const generateMarketingVideoFlow = ai.defineFlow(
  {
    name: 'generateMarketingVideoFlow',
    outputSchema: GenerateMarketingVideoOutputSchema,
  },
  async () => {
    let { operation } = await ai.generate({
      model: googleAI.model('veo-2.0-generate-001'),
      prompt: prompt,
      config: {
        durationSeconds: 8, // Veo can generate up to 8s chunks, we can stitch them later if needed. For now, one chunk.
        aspectRatio: '16:9',
      },
    });

    if (!operation) {
      throw new Error('Expected the model to return an operation');
    }

    // Wait until the operation completes.
    while (!operation.done) {
      operation = await ai.checkOperation(operation);
      // Sleep for 5 seconds before checking again to avoid hammering the API.
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    if (operation.error) {
      throw new Error('Failed to generate video: ' + operation.error.message);
    }

    const videoPart = operation.output?.message?.content.find((p) => !!p.media);
    if (!videoPart || !videoPart.media) {
      throw new Error('Failed to find the generated video in the operation output');
    }
    
    // The media URL from Veo is a temporary download link that needs the API key.
    // We fetch it and convert to a data URI to send to the client.
    const videoDataUri = await convertVideoToDataUri(videoPart.media);

    return { videoDataUri };
  }
);


async function convertVideoToDataUri(video: MediaPart): Promise<string> {
  const fetch = (await import('node-fetch')).default;
  
  if(!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is not set.');
  }
  
  const videoDownloadUrl = `${video.url}&key=${process.env.GEMINI_API_KEY}`;

  const videoDownloadResponse = await fetch(videoDownloadUrl);

  if (!videoDownloadResponse.ok || !videoDownloadResponse.body) {
    throw new Error(`Failed to fetch video. Status: ${videoDownloadResponse.status} ${videoDownloadResponse.statusText}`);
  }

  const videoBuffer = await videoDownloadResponse.arrayBuffer();
  const base64Video = Buffer.from(videoBuffer).toString('base64');
  
  const contentType = video.contentType || 'video/mp4';

  return `data:${contentType};base64,${base64Video}`;
}
