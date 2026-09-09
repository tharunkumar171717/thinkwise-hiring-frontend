import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

interface SearchResponse {
    query: string;
    google_url: string;
}

interface LinkedInSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialJobTitle?: string;
    initialKeywords?: string[];
}

export default function LinkedInSearchModal({ isOpen, onClose, initialJobTitle = '', initialKeywords = [] }: LinkedInSearchModalProps) {
    const [jobTitle, setJobTitle] = useState(initialJobTitle);
    const [skills, setSkills] = useState(initialKeywords.join(', '));
    const [experience, setExperience] = useState('');
    const [location, setLocation] = useState('');

    const [result, setResult] = useState<SearchResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Update state ONLY when the modal transitions to open
    useEffect(() => {
        if (isOpen) {
            setJobTitle(initialJobTitle || '');
            setSkills(initialKeywords ? initialKeywords.join(', ') : '');
            setResult(null);
            setError(null);
        }
    }, [isOpen]); // Remove initialKeywords from dependencies to prevent keystroke resets

    if (!isOpen) return null;

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const data = await api.post('/api/linkedin/search', {
                job_title: jobTitle,
                keywords: skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [],
                location: location || null,
                experience_years: experience ? parseInt(experience) : null
            });

            setResult(data);

            if (data.google_url) {
                window.open(data.google_url, '_blank');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                background: 'white', borderRadius: '12px', padding: '30px',
                width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto',
                position: 'relative'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>LinkedIn Search</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' }}>&times;</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 500 }}>Job Title</label>
                        <input
                            type="text"
                            value={jobTitle}
                            onChange={(e) => setJobTitle(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
                            placeholder="e.g. Backend Engineer"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 500 }}>Keywords (comma separated)</label>
                        <input
                            type="text"
                            value={skills}
                            onChange={(e) => setSkills(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
                            placeholder="python, fastapi, aws"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 500 }}>Experience (years)</label>
                        <input
                            type="number"
                            value={experience}
                            onChange={(e) => setExperience(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
                            placeholder="e.g. 3"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 500 }}>Location</label>
                        <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
                            placeholder="e.g. Remote, Bangalore"
                        />
                    </div>

                    {error && <div style={{ color: '#d32f2f', background: '#ffebee', padding: '10px', borderRadius: '6px', fontSize: '14px' }}>{error}</div>}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button
                            type="button"
                            onClick={handleSearch}
                            disabled={loading}
                            style={{ flex: 1, padding: '12px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                        >
                            {loading ? 'Searching...' : 'Search on LinkedIn'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ flex: 1, padding: '12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>

                {result && (
                    <div style={{ marginTop: '20px', background: '#f8f9fa', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #e0e0e0' }}>
                        <p style={{ marginBottom: '10px', color: '#555', fontWeight: 'bold' }}>Generated Query:</p>
                        <code style={{ display: 'block', padding: '10px', background: '#e9ecef', borderRadius: '4px', wordBreak: 'break-all', marginBottom: '15px', fontSize: '13px', textAlign: 'left' }}>
                            {result.query}
                        </code>
                        <a
                            href={result.google_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'inline-block', textDecoration: 'none', padding: '10px 20px', background: '#28a745', color: 'white', borderRadius: '6px', fontWeight: 600, fontSize: '14px' }}
                        >
                            Open Search in Google
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
