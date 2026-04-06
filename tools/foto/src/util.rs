use chrono::{Datelike, Timelike};

pub fn ordinal_suffix(day: u32) -> &'static str {
    match day {
        11 | 12 | 13 => "th", // special case for 11–13
        _ => match day % 10 {
            1 => "st",
            2 => "nd",
            3 => "rd",
            _ => "th",
        },
    }
}

pub fn format_date(raw: &str, tz_offset: i32) -> Option<String> {
    let format = "%Y:%m:%d %H:%M:%S";
    let dt = chrono::NaiveDateTime::parse_from_str(raw, format).ok()?;

    // Add 30 seconds to afford rounding to nearest minute by truncation, and apply timezone offset.
    let dt = dt
        + chrono::Duration::seconds(30)
        + chrono::Duration::hours(tz_offset as i64);

    let (display_hour, meridian) = match dt.hour() {
        0 => (12, "A.M."),
        1..=11 => (dt.hour(), "A.M."),
        12 => (12, "P.M."),
        _ => (dt.hour() - 12, "P.M."),
    };

    Some(format!(
        "{} {}{}, {} at {}:{:02} {}",
        dt.format("%B"),
        dt.day(),
        ordinal_suffix(dt.day()),
        dt.year(),
        display_hour,
        dt.minute(),
        meridian
    ))
}

pub fn parse_leading_number(input: &str) -> Option<(i32, &str)> {
    let mut digits = String::new();
    for (i, c) in input.char_indices() {
        if c.is_ascii_digit() {
            digits.push(c);
        } else {
            if digits.is_empty() {
                return None;
            } else {
                return digits.parse::<i32>().ok().map(|n| (n, &input[i..]));
            }
        }
    }

    // Handle case where entire string is digits
    if !digits.is_empty() {
        digits.parse::<i32>().ok().map(|n| (n, ""))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinal_suffix_st() {
        assert_eq!(ordinal_suffix(1), "st");
        assert_eq!(ordinal_suffix(21), "st");
        assert_eq!(ordinal_suffix(31), "st");
    }

    #[test]
    fn ordinal_suffix_nd() {
        assert_eq!(ordinal_suffix(2), "nd");
        assert_eq!(ordinal_suffix(22), "nd");
    }

    #[test]
    fn ordinal_suffix_rd() {
        assert_eq!(ordinal_suffix(3), "rd");
        assert_eq!(ordinal_suffix(23), "rd");
    }

    #[test]
    fn ordinal_suffix_th() {
        assert_eq!(ordinal_suffix(4), "th");
        assert_eq!(ordinal_suffix(10), "th");
        assert_eq!(ordinal_suffix(20), "th");
    }

    #[test]
    fn ordinal_suffix_teens_are_th() {
        // 11, 12, 13 are special-cased to "th" even though they end in 1/2/3
        assert_eq!(ordinal_suffix(11), "th");
        assert_eq!(ordinal_suffix(12), "th");
        assert_eq!(ordinal_suffix(13), "th");
    }

    #[test]
    fn format_date_basic() {
        // 2024:06:15 14:30:00 UTC+0 → "June 15th, 2024 at 2:30 P.M."
        let result = format_date("2024:06:15 14:30:00", 0);
        assert_eq!(result, Some("June 15th, 2024 at 2:30 P.M.".to_string()));
    }

    #[test]
    fn format_date_midnight_is_12am() {
        let result = format_date("2024:01:01 00:00:00", 0);
        assert_eq!(result, Some("January 1st, 2024 at 12:00 A.M.".to_string()));
    }

    #[test]
    fn format_date_noon_is_12pm() {
        let result = format_date("2024:01:01 12:00:00", 0);
        assert_eq!(result, Some("January 1st, 2024 at 12:00 P.M.".to_string()));
    }

    #[test]
    fn format_date_timezone_offset() {
        // 21:59:30 + 30s (rounding) + 2h offset = June 16 00:00:00
        let result = format_date("2024:06:15 21:59:30", 2);
        assert_eq!(result, Some("June 16th, 2024 at 12:00 A.M.".to_string()));
    }

    #[test]
    fn format_date_rounding_down() {
        // 14:30:29 + 30s rounds down to 14:30
        let result = format_date("2024:06:15 14:30:29", 0);
        assert_eq!(result, Some("June 15th, 2024 at 2:30 P.M.".to_string()));
    }

    #[test]
    fn format_date_rounding_up() {
        // 14:30:30 + 30s rounds up to 14:31
        let result = format_date("2024:06:15 14:30:30", 0);
        assert_eq!(result, Some("June 15th, 2024 at 2:31 P.M.".to_string()));
    }

    #[test]
    fn format_date_invalid_input() {
        assert_eq!(format_date("not a date", 0), None);
        assert_eq!(format_date("", 0), None);
    }

    #[test]
    fn parse_leading_number_basic() {
        assert_eq!(parse_leading_number("42abc"), Some((42, "abc")));
    }

    #[test]
    fn parse_leading_number_entire_string() {
        assert_eq!(parse_leading_number("123"), Some((123, "")));
    }

    #[test]
    fn parse_leading_number_no_leading_digit() {
        assert_eq!(parse_leading_number("abc123"), None);
        assert_eq!(parse_leading_number(""), None);
    }

    #[test]
    fn parse_leading_number_underscore_separator() {
        assert_eq!(parse_leading_number("4_image.jpg"), Some((4, "_image.jpg")));
    }
}
