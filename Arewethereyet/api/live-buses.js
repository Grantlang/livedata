import { XMLParser } from 'fast-xml-parser';

export default async function handler(req, res) {
  // 1. Set cache headers so Vercel keeps it fast and protects your API limits
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  // 2. Fetch the live data from the government portal
  // Make sure you replace 'YOUR_ACTUAL_API_KEY_HERE' with your real BODS key for local testing!
  const BODS_API_KEY = process.env.BODS_API_KEY || '0e16a2e7850c196629f9e96612e086ef5594685b';
  const BODS_API_URL = 'https://data.bus-data.dft.gov.uk/api/v1/datafeed/12319/?api_key=0e16a2e7850c196629f9e96612e086ef5594685b';

  try {
    const response = await fetch(BODS_API_URL);
    if (!response.ok) throw new Error('BODS API connection failed');
    
    const xmlData = await response.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const jsonObj = parser.parse(xmlData);

    const delivery = jsonObj?.Siri?.ServiceDelivery?.VehicleMonitoringDelivery;
    let vehicleActivities = delivery?.VehicleActivity || [];

    if (!Array.isArray(vehicleActivities)) {
      vehicleActivities = [vehicleActivities];
    }

    // 3. Map out the messy XML data into clean GeoJSON for your map
    const features = vehicleActivities
      .filter(activity => {
        const location = activity?.MonitoredVehicleJourney?.VehicleLocation;
        return location?.Longitude && location?.Latitude;
      })
      .map(activity => {
        const journey = activity.MonitoredVehicleJourney;
        const location = journey.VehicleLocation;

        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [parseFloat(location.Longitude), parseFloat(location.Latitude)]
          },
          properties: {
            id: journey.VehicleRef || activity.RecordedAtTime,
            lineName: journey.PublishedLineName || 'NX',
            origin: journey.OriginName || 'Unknown',
            destination: journey.DestinationName || 'Unknown',
            bearing: parseFloat(journey.Bearing) || 0
          }
        };
      });

    // 4. Return the finished product
    return res.status(200).json({
      type: 'FeatureCollection',
      features: features
    });

  } catch (error) {
    console.error('Error processing GeoJSON:', error);
    return res.status(500).json({ error: 'Failed to process transit data' });
  }
}