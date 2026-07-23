const PORT = process.env.PORT || 3000;
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 3000;
const API_TOKEN = '52f66e8147f677a44f058067e7ffde6e6e7696a5';
const BASE_URL = 'https://sports.bzzoiro.com/api/v2';

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

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
        console.log(`📊 Fetched ${allLeagues.length} leagues total`);
        allLeagues.forEach(league => {
            if (league.id && league.name) {
                leagueCache[league.id] = league.name;
                leagueCache[String(league.id)] = league.name;
            }
        });
        leagueCacheTime = now;
        console.log(`✅ Cached ${Object.keys(leagueCache).length} league names`);
        return leagueCache;
    } catch (error) {
        console.error('❌ Error fetching leagues:', error.message);
        return leagueCache;
    }
}

async function getLeagueName(leagueId) {
    if (!leagueId) return null;
    if (Object.keys(leagueCache).length === 0) await fetchLeagues();
    const name = leagueCache[leagueId] || leagueCache[String(leagueId)] || null;
    if (!name) {
        try {
            const response = await axios.get(`${BASE_URL}/leagues/${leagueId}/`, {
                headers: { 'Authorization': `Token ${API_TOKEN}`, 'Accept': 'application/json' },
                timeout: 5000
            });
            if (response.data && response.data.name) {
                leagueCache[leagueId] = response.data.name;
                leagueCache[String(leagueId)] = response.data.name;
                return response.data.name;
            }
        } catch (error) {
            console.log(`❌ Failed to fetch league ${leagueId}`);
        }
        return null;
    }
    return name;
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

// ============================================
// /API/FIXTURES ENDPOINT - WITH POSSESSION!
// ============================================
app.get('/api/fixtures', async (req, res) => {
    try {
        const date = req.query.date || getToday();
        const league = req.query.league || '';

        console.log('📅 Fetching fixtures for date:', date);

        let url = `${BASE_URL}/events/?date_from=${date}&date_to=${date}&limit=200`;
        if (league) url += `&league_id=${league}`;

        console.log('🔗 URL:', url);

        const response = await axios.get(url, {
            headers: { 'Authorization': `Token ${API_TOKEN}`, 'Accept': 'application/json' },
            timeout: 10000
        });

        const data = response.data;
        const events = data.results || data.events || [];

        console.log(`📊 Found ${events.length} events`);

        // Fetch league names
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
                // ✅ FIXED: POSSESSION FROM EVENT OBJECT
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

        console.log(`✅ Returning ${transformed.length} fixtures with possession`);
        res.json({ response: transformed });

    } catch (error) {
        console.error('❌ Fixtures API Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch fixtures', message: error.message });
    }
});

app.get('/api/debug-stats/:id', async (req, res) => {
    try {
        const eventId = req.params.id;
        const response = await axios.get(`https://sports.bzzoiro.com/api/v2/events/${eventId}/stats/`, {
            headers: { 'Authorization': `Token ${API_TOKEN}`, 'Accept': 'application/json' },
            timeout: 5000
        });

        const stats = response.data;

        // Log all keys in stats.stats.home
        console.log('🔍 HOME STATS KEYS:', Object.keys(stats.stats?.home || {}));
        console.log('🔍 AWAY STATS KEYS:', Object.keys(stats.stats?.away || {}));

        res.json({
            event_id: eventId,
            home_keys: Object.keys(stats.stats?.home || {}),
            away_keys: Object.keys(stats.stats?.away || {}),
            full_stats: stats
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.get('/api/debug-all-keys/:id', async (req, res) => {
    try {
        const eventId = req.params.id;
        const response = await axios.get(`https://sports.bzzoiro.com/api/v2/events/${eventId}/stats/`, {
            headers: { 'Authorization': `Token ${API_TOKEN}`, 'Accept': 'application/json' },
            timeout: 5000
        });

        const stats = response.data;

        // Get all keys recursively
        function getAllKeys(obj, prefix = '') {
            let keys = [];
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                Object.keys(obj).forEach(key => {
                    const fullKey = prefix ? `${prefix}.${key}` : key;
                    keys.push(fullKey);
                    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                        keys = keys.concat(getAllKeys(obj[key], fullKey));
                    }
                });
            }
            return keys;
        }

        const allKeys = getAllKeys(stats);

        res.json({
            event_id: eventId,
            all_keys: allKeys,
            full_stats: stats
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.get('/api/debug-incidents/:id', async (req, res) => {
    try {
        const eventId = req.params.id;
        const response = await axios.get(`https://sports.bzzoiro.com/api/v2/events/${eventId}/incidents/`, {
            headers: { 'Authorization': `Token ${API_TOKEN}`, 'Accept': 'application/json' },
            timeout: 5000
        });

        const incidents = response.data;

        // Get all keys
        const allKeys = Object.keys(incidents);

        // Count different incident types
        const incidentTypes = {};
        if (incidents.incidents && Array.isArray(incidents.incidents)) {
            incidents.incidents.forEach(inc => {
                const type = inc.type || 'unknown';
                incidentTypes[type] = (incidentTypes[type] || 0) + 1;
            });
        }

        res.json({
            event_id: eventId,
            all_keys: allKeys,
            incident_types: incidentTypes,
            total_incidents: incidents.incidents?.length || 0,
            sample_incidents: incidents.incidents?.slice(0, 5) || [],
            full_incidents: incidents
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// ============================================
// /API/EVENTS ENDPOINT - ALSO WITH POSSESSION!
// ============================================
app.get('/api/events', async (req, res) => {
    try {
        let { date_from, date_to, status, limit = 200 } = req.query;
        if (!date_from && !date_to) {
            const today = getToday();
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

        if (events.length === 0) return res.json([]);

        const filteredEvents = events.filter(event => {
            const eventDate = event.event_date ? event.event_date.split('T')[0] : null;
            if (!eventDate) return true;
            let keep = true;
            if (date_from && eventDate < date_from) keep = false;
            if (date_to && eventDate > date_to) keep = false;
            return keep;
        });

        if (filteredEvents.length === 0) return res.json([]);

        await fetchLeagues();

        const enrichedEvents = await Promise.all(
            filteredEvents.slice(0, 100).map(async (event) => {
                let leagueName = event.league_name || event.league || null;
                if (!leagueName && event.league_id) {
                    leagueName = await getLeagueName(event.league_id);
                    if (!leagueName) leagueName = `League ${event.league_id}`;
                }
                if (!leagueName) leagueName = 'Unknown League';

                let stats = {};
                let incidents = {};
                let homeSubs = 0;
                let awaySubs = 0;

                try {
                    const statsResponse = await axios.get(`${BASE_URL}/events/${event.id}/stats/`, {
                        headers: { 'Authorization': `Token ${API_TOKEN}`, 'Accept': 'application/json' },
                        timeout: 5000
                    });
                    stats = statsResponse.data || {};

                    const incidentsResponse = await axios.get(`${BASE_URL}/events/${event.id}/incidents/`, {
                        headers: { 'Authorization': `Token ${API_TOKEN}`, 'Accept': 'application/json' },
                        timeout: 5000
                    });
                    incidents = incidentsResponse.data || {};

                    // ✅ Count substitutions from incidents
                    if (incidents.incidents && Array.isArray(incidents.incidents)) {
                        incidents.incidents.forEach(inc => {
                            if (inc.type === 'substitution' || inc.type === 'sub') {
                                if (inc.is_home === true) homeSubs++;
                                else if (inc.is_home === false) awaySubs++;
                            }
                        });
                    }

                } catch (error) {
                    console.log(`⚠️ No data for event ${event.id}`);
                }

                return {
                    ...event,
                    league_name: leagueName,
                    momentum: stats.momentum || [],
                    momentum_home: stats.momentum?.home,
                    momentum_away: stats.momentum?.away,
                    possession_home: stats.stats?.home?.ball_safe_pct ?? null,
                    possession_away: stats.stats?.away?.ball_safe_pct ?? null,
                    passes_home: stats.stats?.home?.passes ?? null,
                    passes_away: stats.stats?.away?.passes ?? null,
                    accurate_passes_home: stats.stats?.home?.accurate_passes ?? null,
                    accurate_passes_away: stats.stats?.away?.accurate_passes ?? null,
                    pass_accuracy_home: stats.stats?.home?.pass_accuracy_pct ?? null,
                    pass_accuracy_away: stats.stats?.away?.pass_accuracy_pct ?? null,
                    total_tackles_home: stats.stats?.home?.total_tackles ?? null,
                    total_tackles_away: stats.stats?.away?.total_tackles ?? null,
                    tackles_won_home: stats.stats?.home?.tackles_won ?? null,
                    tackles_won_away: stats.stats?.away?.tackles_won ?? null,
                    interceptions_home: stats.stats?.home?.interceptions ?? null,
                    interceptions_away: stats.stats?.away?.interceptions ?? null,
                    clearances_home: stats.stats?.home?.clearances ?? null,
                    clearances_away: stats.stats?.away?.clearances ?? null,
                    xg_home: stats.stats?.home?.xg?.actual ?? null,
                    xg_away: stats.stats?.away?.xg?.actual ?? null,
                    shots_home: stats.stats?.home?.total_shots ?? null,
                    shots_away: stats.stats?.away?.total_shots ?? null,
                    shots_on_target_home: stats.stats?.home?.shots_on_target ?? null,
                    shots_on_target_away: stats.stats?.away?.shots_on_target ?? null,
                    blocked_shots_home: stats.stats?.home?.blocked_shots ?? null,
                    blocked_shots_away: stats.stats?.away?.blocked_shots ?? null,
                    duels_home: stats.stats?.home?.duels ?? null,
                    duels_away: stats.stats?.away?.duels ?? null,
                    aerial_duels_home: stats.stats?.home?.aerial_duels?.value ?? null,
                    aerial_duels_away: stats.stats?.away?.aerial_duels?.value ?? null,
                    corners_home: stats.stats?.home?.corner_kicks ?? null,
                    corners_away: stats.stats?.away?.corner_kicks ?? null,
                    free_kicks_home: stats.stats?.home?.free_kicks ?? null,
                    free_kicks_away: stats.stats?.away?.free_kicks ?? null,
                    throw_ins_home: stats.stats?.home?.throw_ins ?? null,
                    throw_ins_away: stats.stats?.away?.throw_ins ?? null,
                    goal_kicks_home: stats.stats?.home?.goal_kicks ?? null,
                    goal_kicks_away: stats.stats?.away?.goal_kicks ?? null,
                    attacks_home: stats.stats?.home?.attack ?? null,
                    attacks_away: stats.stats?.away?.attack ?? null,
                    dangerous_attacks_home: stats.stats?.home?.dangerous_attack ?? null,
                    dangerous_attacks_away: stats.stats?.away?.dangerous_attack ?? null,
                    fouls_home: stats.stats?.home?.fouls ?? null,
                    fouls_away: stats.stats?.away?.fouls ?? null,
                    yellow_cards_home: stats.stats?.home?.yellow_cards ?? null,
                    yellow_cards_away: stats.stats?.away?.yellow_cards ?? null,
                    red_cards_home: stats.stats?.home?.red_cards ?? null,
                    red_cards_away: stats.stats?.away?.red_cards ?? null,
                    fouls_home: stats.stats?.home?.fouls ?? null,
                    fouls_away: stats.stats?.away?.fouls ?? null,
                    offsides_home: stats.offsides?.home,
                    offsides_away: stats.offsides?.away,
                    gk_saves_home: stats.stats?.home?.goalkeeper_saves ?? null,
                    gk_saves_away: stats.stats?.away?.goalkeeper_saves ?? null,
                    big_saves_home: stats.stats?.home?.big_saves ?? null,
                    big_saves_away: stats.stats?.away?.big_saves ?? null,
                    goals_prevented_home: stats.stats?.home?.goals_prevented ?? null,
                    goals_prevented_away: stats.stats?.away?.goals_prevented ?? null,
                    key_passes_home: stats.key_passes?.home,
                    key_passes_away: stats.key_passes?.away,
                    crosses_home: stats.crosses?.home,
                    crosses_away: stats.crosses?.away,
                    passing_accuracy_home: stats.passing_accuracy?.home,
                    passing_accuracy_away: stats.passing_accuracy?.away,
                    crossing_accuracy_home: stats.crossing_accuracy?.home,
                    crossing_accuracy_away: stats.crossing_accuracy?.away,
                    free_kicks_home: stats.free_kicks?.home,
                    free_kicks_away: stats.free_kicks?.away,
                    injuries_home: stats.injuries?.home,
                    injuries_away: stats.injuries?.away,
                    penalties_home: stats.penalties?.home,
                    penalties_away: stats.penalties?.away,
                    substitutions_home: homeSubs,
                    substitutions_away: awaySubs
                };
            })
        );

        res.json(enrichedEvents);

    } catch (error) {
        console.error('❌ API Error:', error.message);
        res.json([]);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});