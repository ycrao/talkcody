use crate::constants::{is_code_extension, is_code_filename, should_exclude_dir};
use ignore::WalkBuilder;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSearchResult {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub score: f64,
}

pub struct HighPerformanceFileSearch {
    max_results: usize,
}

impl Default for HighPerformanceFileSearch {
    fn default() -> Self {
        Self {
            max_results: 200,
        }
    }
}

impl HighPerformanceFileSearch {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_max_results(mut self, max_results: usize) -> Self {
        self.max_results = max_results;
        self
    }

    /// High-performance file search with fuzzy matching and scoring
    pub fn search_files(&self, root_path: &str, query: &str) -> Result<Vec<FileSearchResult>, String> {
        if query.trim().is_empty() {
            return Ok(vec![]);
        }

        let keywords = Self::parse_query(query);
        if keywords.is_empty() {
            return Ok(vec![]);
        }

        // Use sequential file collection with ignore crate for simplicity and correctness
        let mut walker_builder = WalkBuilder::new(root_path);

        walker_builder
            .hidden(true)
            .git_ignore(true)
            .git_global(true)
            .git_exclude(true)
            .ignore(true)
            .parents(true)
            .max_depth(Some(20))
            .filter_entry(|entry| {
                if entry.path().is_dir() {
                    if let Some(name) = entry.path().file_name().and_then(OsStr::to_str) {
                        return !should_exclude_dir(name);
                    }
                }
                true
            });

        let walker = walker_builder.build();
        let mut results = Vec::new();

        for result in walker {
            if let Ok(entry) = result {
                // Skip root directory
                if entry.depth() == 0 {
                    continue;
                }

                let path = entry.path();

                // Filter files only (not directories for now, but we can include them if needed)
                if !path.is_file() {
                    continue;
                }

                // Check if it's a code file
                if !self.is_code_file(path) {
                    continue;
                }

                if let Some(filename) = path.file_name().and_then(OsStr::to_str) {
                    if let Some(search_result) = self.match_filename(filename, path, &keywords) {
                        results.push(search_result);
                        if results.len() >= self.max_results {
                            break;
                        }
                    }
                }
            }
        }

        let mut final_results = results;

        // Sort by score (descending) and then by name length (ascending)
        final_results.par_sort_unstable_by(|a, b| {
            let score_cmp = b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal);
            if score_cmp != std::cmp::Ordering::Equal {
                score_cmp
            } else {
                a.name.len().cmp(&b.name.len())
            }
        });

        final_results.truncate(self.max_results);
        Ok(final_results)
    }


    /// Parse search query into keywords, splitting on spaces and non-alphanumeric chars
    fn parse_query(query: &str) -> Vec<String> {
        query
            .to_lowercase()
            .split_whitespace()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect()
    }

    /// Check if a file is a code file based on extension
    fn is_code_file(&self, path: &Path) -> bool {
        if let Some(ext) = path.extension().and_then(OsStr::to_str) {
            return is_code_extension(ext);
        }

        // Check for files without extensions (like Dockerfile, Makefile, etc.)
        if let Some(filename) = path.file_name().and_then(OsStr::to_str) {
            return is_code_filename(filename);
        }

        false
    }

    /// Advanced filename matching with scoring
    fn match_filename(&self, filename: &str, full_path: &Path, keywords: &[String]) -> Option<FileSearchResult> {
        let filename_lower = filename.to_lowercase();

        // Check if all keywords match
        if !keywords.iter().all(|keyword| self.keyword_matches(&filename_lower, keyword)) {
            return None;
        }

        // Calculate match score
        let score = self.calculate_match_score(&filename_lower, keywords);

        Some(FileSearchResult {
            name: filename.to_string(),
            path: full_path.to_string_lossy().to_string(),
            is_directory: false,
            score,
        })
    }

    /// Check if a keyword matches using multiple strategies
    fn keyword_matches(&self, filename: &str, keyword: &str) -> bool {
        // Direct substring match
        if filename.contains(keyword) {
            return true;
        }

        // Fuzzy match: check if keyword characters appear in order
        self.fuzzy_match(filename, keyword)
    }

    /// Fuzzy matching: check if all characters of keyword appear in order in filename
    fn fuzzy_match(&self, filename: &str, keyword: &str) -> bool {
        let filename_chars: Vec<char> = filename.chars().collect();
        let keyword_chars: Vec<char> = keyword.chars().collect();

        if keyword_chars.is_empty() {
            return true;
        }

        let mut keyword_idx = 0;

        for &file_char in &filename_chars {
            if keyword_idx < keyword_chars.len() && file_char == keyword_chars[keyword_idx] {
                keyword_idx += 1;
            }
        }

        keyword_idx == keyword_chars.len()
    }

    /// Calculate match score for ranking results
    fn calculate_match_score(&self, filename: &str, keywords: &[String]) -> f64 {
        if keywords.is_empty() {
            return 0.0;
        }

        let mut score = 0.0;

        // Bonus for exact filename match
        let combined_query = keywords.join("");
        if filename == combined_query {
            score += 1000.0;
        }

        // Bonus for continuous substring matches
        if filename.contains(&combined_query) {
            score += 500.0;
        }

        // Bonus for continuous match with separators
        let separated_query = keywords.join("-");
        if filename.contains(&separated_query) {
            score += 400.0;
        }

        let separated_query_underscore = keywords.join("_");
        if filename.contains(&separated_query_underscore) {
            score += 400.0;
        }

        let separated_query_dot = keywords.join(".");
        if filename.contains(&separated_query_dot) {
            score += 300.0;
        }

        // Bonus for starts with first keyword
        if let Some(first_keyword) = keywords.first() {
            if filename.starts_with(first_keyword) {
                score += 200.0;
            }
        }

        // Bonus for all keywords in order (even with gaps)
        if self.all_keywords_in_order(filename, keywords) {
            score += 150.0;
        }

        // Individual keyword bonuses
        for keyword in keywords {
            // Exact word boundary match
            if self.word_boundary_match(filename, keyword) {
                score += 100.0;
            }
            // Substring match
            else if filename.contains(keyword) {
                score += 50.0;
            }
            // Fuzzy match (lowest bonus)
            else if self.fuzzy_match(filename, keyword) {
                score += 25.0;
            }
        }

        // Penalty for length (shorter names rank higher)
        score -= filename.len() as f64 * 0.1;

        // Bonus for common file types
        if filename.ends_with(".ts") || filename.ends_with(".js") || filename.ends_with(".tsx") || filename.ends_with(".jsx") {
            score += 10.0;
        }

        score.max(0.0)
    }

    /// Check if all keywords appear in order in the filename
    fn all_keywords_in_order(&self, filename: &str, keywords: &[String]) -> bool {
        let mut last_index = 0;

        for keyword in keywords {
            if let Some(index) = filename[last_index..].find(keyword) {
                last_index += index + keyword.len();
            } else {
                return false;
            }
        }

        true
    }

    /// Check for word boundary matches
    fn word_boundary_match(&self, filename: &str, keyword: &str) -> bool {
        // Simple word boundary check using common separators
        let separators = ['-', '_', '.', ' ', '/'];

        // Check if keyword appears at start of filename
        if filename.starts_with(keyword) {
            return filename.len() == keyword.len() ||
                   separators.iter().any(|&sep| filename.chars().nth(keyword.len()) == Some(sep));
        }

        // Check if keyword appears after a separator
        for (i, window) in filename.char_indices() {
            if separators.contains(&window) {
                let remaining = &filename[i + 1..];
                if remaining.starts_with(keyword) {
                    return remaining.len() == keyword.len() ||
                           separators.iter().any(|&sep| remaining.chars().nth(keyword.len()) == Some(sep));
                }
            }
        }

        false
    }
}