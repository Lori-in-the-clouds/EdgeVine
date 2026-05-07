import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  try {
    // Call the Flask analytics API container
    // Se stiamo girando in Docker, l'host è il nome del container (analytics-api)
    // Usiamo una variabile d'ambiente o il fallback al container Docker
    const flaskApiUrl = process.env.ANALYTICS_API_URL || 'http://analytics-api:5001/predictions';


    const response = await fetch(flaskApiUrl, {
      // Small timeout to not hang the dashboard if the analytics container is down
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`Analytics API responded with ${response.status}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("Predictions API Proxy Error:", error);
    
    // Return a graceful error so the frontend doesn't crash, 
    // it just shows no predictions available.
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      status: 'unavailable'
    }), {
      status: 200, // Returning 200 so the frontend handles the graceful degradation
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
