
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Clapperboard, Download, Loader2, Video } from 'lucide-react';
import { generateMarketingVideo } from '@/ai/flows/generate-marketing-video';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export default function MarketingVideoPage() {
  const [videoDataUri, setVideoDataUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerateVideo = async () => {
    setIsLoading(true);
    setVideoDataUri(null);
    toast({
      title: 'Video Generation Started',
      description: 'This may take a minute or two. Please be patient.',
    });

    try {
      const result = await generateMarketingVideo();
      if (result.videoDataUri) {
        setVideoDataUri(result.videoDataUri);
        toast({
          title: 'Video Generated Successfully!',
          description: 'You can now preview and download the video.',
        });
      } else {
        throw new Error('Video generation did not return a video.');
      }
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      toast({
        variant: 'destructive',
        title: 'Video Generation Failed',
        description: `Could not generate the marketing video. Please try again later. Error: ${errorMessage}`,
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDownload = () => {
    if (!videoDataUri) return;
    const link = document.createElement('a');
    link.href = videoDataUri;
    link.download = 'courtsync_marketing_video.mp4';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Generate Marketing Video</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clapperboard className="h-6 w-6 text-primary" />
            AI-Powered Video Generator
          </CardTitle>
          <CardDescription>
            Click the button below to generate a short (less than 1 minute) marketing video.
            The video will explain the key features of the CourtSync platform, perfect for sharing with new and potential users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Video className="h-4 w-4" />
            <AlertTitle>How it works</AlertTitle>
            <AlertDescription>
                Our AI will create a unique video based on a pre-defined prompt that highlights features like booking, user management, and credit purchasing. The generation process can take up to two minutes.
            </AlertDescription>
          </Alert>

          <Button onClick={handleGenerateVideo} disabled={isLoading} size="lg">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating Video...
              </>
            ) : (
              'Generate Video'
            )}
          </Button>

          {videoDataUri && (
            <div className="space-y-4 rounded-lg border bg-card text-card-foreground p-4">
                <h3 className="font-semibold">Your Video is Ready!</h3>
                <div className="aspect-video w-full max-w-2xl mx-auto bg-black rounded-md overflow-hidden">
                    <video
                        src={videoDataUri}
                        controls
                        className="w-full h-full"
                    >
                        Your browser does not support the video tag.
                    </video>
                </div>
                <Button onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Download Video
                </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
