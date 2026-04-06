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

    let month = dt.format("%B").to_string(); // "March"
    let day = dt.day();
    let year = dt.year();

    // TODO: This may need to roll over the day
    let mut hour = (dt.hour() as i32 + tz_offset) % 24;
    let mut minute = dt.minute();
    let second = dt.second();

    // Round the minute based on seconds
    if second >= 30 {
        minute += 1;
        if minute == 60 {
            minute = 0;
            hour = (hour + 1) % 24;
        }
    }

    let (display_hour, meridian) = match dt.hour() {
        0 => (12, "A.M."),
        1..=11 => (dt.hour() as i32, "A.M."),
        12 => (12, "P.M."),
        _ => (dt.hour() as i32 - 12, "P.M."),
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
