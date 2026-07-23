const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_TOKEN = '52f66e8147f677a44f058067e7ffde6e6e7696a5';
const BASE_URL = 'https://sports.bzzoiro.com/api/v2';

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        status: 'ok',
        message: 'API is working!',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// YOUR API ENDPOINTS
// ============================================

app.get('/api/fixtures', async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const league = req.query.league || '';

        let url = `${BASE_URL}/events/?date_from=${date}&date_to=${date}&limit=200`;
        if (league) url += `&league_id=${league}`;

        const response = await axios.get(url, {
            headers: { 'Authorization': `Token ${API_TOKEN}`, 'Accept': 'application/json' },
            timeout: 10000
        });

        const data = response.data;
        const events = data.results || data.events || [];

        await fetchLeagues();

        const transformed = events.map(event => {
            let leagueName = event.league_name || event.league || null;
            if (!leagueName && event.league_id) {
                leagueName = leagueCache[event.league_id] || `League ${event.league_id}`;
            }
            if (!leagueName) leagueName = 'Unknown League';

            const homeTeam = event.home_team || 'Home';
            const awayTeam = event.away_team || 'Away';

            const status = event.status || '';
            let statusShort = 'NS';
            let elapsed = null;

            if (status === 'finished' || status === 'ft' || status === 'fulltime') {
                statusShort = 'FT';
            } else if (status === 'aet' || status === 'extratime') {
                statusShort = 'AET';
            } else if (status === 'penalties' || status === 'pen') {
                statusShort = 'PEN';
            } else if (status === 'halftime') {
                statusShort = 'HT';
            } else if (status === '1st_half' || status === 'first_half') {
                statusShort = '1H';
                elapsed = event.current_minute || 0;
            } else if (status === '2nd_half' || status === 'second_half') {
                statusShort = '2H';
                elapsed = event.current_minute || 0;
            } else if (status === 'inprogress' || status === 'live') {
                statusShort = '1H';
                elapsed = event.current_minute || 0;
            }

            return {
                fixture: {
                    id: event.id || 0,
                    date: event.event_date || '',
                    status: { short: statusShort, elapsed: elapsed },
                    venue: { name: event.venue_name || '', id: event.venue_id || 0 }
                },
                league: {
                    id: event.league_id || 0,
                    name: leagueName,
                    logo: '',
                    country: event.country || ''
                },
                teams: {
                    home: { id: event.home_team_id || 0, name: homeTeam, logo: '' },
                    away: { id: event.away_team_id || 0, name: awayTeam, logo: '' }
                },
                goals: {
                    home: event.home_score !== undefined && event.home_score !== null ? event.home_score : null,
                    away: event.away_score !== undefined && event.away_score !== null ? event.away_score : null
                },
                possession: {
                    home: event.possession?.home || 50,
                    away: event.possession?.away || 50
                },
                extra_time: {
                    home: event.extra_time_score?.home || null,
                    away: event.extra_time_score?.away || null
                },
                penalty: {
                    home: event.penalty_shootout?.home || null,
                    away: event.penalty_shootout?.away || null
                }
            };
        });

        res.json({ response: transformed });

    } catch (error) {
        console.error('❌ Fixtures API Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch fixtures', message: error.message });
    }
});

app.get('/api/events', async (req, res) => {
    try {
        let { date_from, date_to, status, limit = 200 } = req.query;
        if (!date_from && !date_to) {
            const today = new Date().toISOString().split('T')[0];
            date_from = today;
            date_to = today;
        }

        const params = { limit: Math.min(parseInt(limit), 200) };
        if (date_from) params.date_from = date_from + 'T00:00:00Z';
        if (date_to) params.date_to = date_to + 'T23:59:59Z';
        if (status && status !== 'all') params.status = status;

        const response = await axios.get(`${BASE_URL}/events/`, {
            headers: { 'Authorization': `Token ${API_TOKEN}`, 'Accept': 'application/json' },
            params,
            timeout: 15000
        });

        let events = [];
        const data = response.data;
        if (Array.isArray(data)) events = data;
        else if (data && typeof data === 'object') {
            if (data.results && Array.isArray(data.results)) events = data.results;
            else if (data.events && Array.isArray(data.events)) events = data.events;
            else {
                for (const key in data) {
                    if (Array.isArray(data[key])) { events = data[key]; break; }
                }
            }
        }

        const transformed = events.map(event => ({
            id: event.id,
            home_team: event.home_team || 'Home',
            away_team: event.away_team || 'Away',
            home_score: event.home_score || 0,
            away_score: event.away_score || 0,
            league_name: event.league_name || 'Unknown League',
            status: event.status || 'NS',
            current_minute: event.current_minute || 0,
            event_date: event.event_date || '',
            possession: event.possession || { home: 50, away: 50 }
        }));

        res.json({ response: transformed });

    } catch (error) {
        console.error('❌ API Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch events', message: error.message });
    }
});

// ✅ Catch-all route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
    console.log(`📡 /api/fixtures`);
    console.log(`📡 /api/events`);
    console.log(`🧪 /api/test`);
});

// League cache
let leagueCache = {};
let leagueCacheTime = 0;
const CACHE_TTL = 3600000;

async function fetchLeagues() {
    const now = Date.now();
    if (leagueCacheTime > 0 && (now - leagueCacheTime) < CACHE_TTL) {
        return leagueCache;
    }
    try {
        console.log('🔄 Fetching all leagues...');
        let allLeagues = [];
        let offset = 0;
        const limit = 200;
        let hasMore = true;
        while (hasMore) {
            const response = await axios.get(`${BASE_URL}/leagues/`, {
                headers: { 'Authorization': `Token ${API_TOKEN}`, 'Accept': 'application/json' },
                params: { limit, offset, include_inactive: true },
                timeout: 10000
            });
            const leagues = Array.isArray(response.data) ? response.data : [];
            allLeagues = allLeagues.concat(leagues);
            if (leagues.length < limit) hasMore = false;
            else offset += limit;
        }
        console.log(`📊 Fetched ${allLeagues.length} leagues`);
        allLeagues.forEach(league => {
            if (league.id && league.name) {
                leagueCache[league.id] = league.name;
                leagueCache[String(league.id)] = league.name;
            }
        });
        leagueCacheTime = now;
        return leagueCache;
    } catch (error) {
        console.error('❌ Error fetching leagues:', error.message);
        return leagueCache;
    }
}
