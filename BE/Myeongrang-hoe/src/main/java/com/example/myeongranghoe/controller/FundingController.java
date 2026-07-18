package com.example.myeongranghoe.controller;

import com.example.myeongranghoe.config.UserContext;
import com.example.myeongranghoe.dto.FundingResponse;
import com.example.myeongranghoe.service.CommunityService;
import com.example.myeongranghoe.service.FundingService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/fundings")
public class FundingController {
    private final FundingService fundingService;
    private final CommunityService communityService;

    public FundingController(FundingService fundingService, CommunityService communityService) {
        this.fundingService = fundingService;
        this.communityService = communityService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> list(
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false, defaultValue = "5") double radiusKm
    ) {
        List<FundingResponse> items;
        if (lat != null && lng != null) {
            items = fundingService.listNearby(lat, lng, radiusKm);
        } else {
            items = fundingService.listAll();
        }
        return ResponseEntity.ok(Map.of("success", true, "fundings", items));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable Long id) {
        return ResponseEntity.ok(Map.of("success", true, "funding", fundingService.get(id)));
    }

    /**
     * iPhone Safari 등에서 "캘린더에 추가" 시트로 열리도록
     * Content-Type: text/calendar + Content-Disposition: inline
     */
    @GetMapping(value = "/{id}/calendar.ics", produces = "text/calendar")
    public ResponseEntity<byte[]> calendarIcs(@PathVariable Long id) {
        FundingResponse f = fundingService.get(id);
        if (f.meetAt() == null || f.meetAt().isBlank()) {
            throw new IllegalArgumentException("확정된 만남 일정이 없어요.");
        }
        Instant start = parseMeetAt(f.meetAt());
        if (start == null) {
            throw new IllegalArgumentException("만남 일정 형식을 해석할 수 없어요.");
        }
        Instant end = start.plus(2, ChronoUnit.HOURS);
        String title = "[명랑회] " + nullToEmpty(f.title());
        String location = joinLocation(f.locationName(), f.address());
        String description = nullToEmpty(f.description());
        String ics = buildIcs(id, title, description, location, start, end);
        byte[] body = ics.getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"myeongrang-" + id + ".ics\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(new MediaType("text", "calendar", StandardCharsets.UTF_8))
                .body(body);
    }

    private static String buildIcs(
            long id,
            String title,
            String description,
            String location,
            Instant start,
            Instant end
    ) {
        String uid = "funding-" + id + "@myeongrang.hoe";
        List<String> lines = new ArrayList<>();
        lines.add("BEGIN:VCALENDAR");
        lines.add("VERSION:2.0");
        lines.add("PRODID:-//Myeongranghoe//Calendar//KO");
        lines.add("CALSCALE:GREGORIAN");
        lines.add("METHOD:PUBLISH");
        lines.add("BEGIN:VEVENT");
        lines.add("UID:" + uid);
        lines.add("DTSTAMP:" + toUtcStamp(Instant.now()));
        lines.add("DTSTART:" + toUtcStamp(start));
        lines.add("DTEND:" + toUtcStamp(end));
        lines.add("SUMMARY:" + escapeIcs(title));
        if (!description.isBlank()) {
            lines.add("DESCRIPTION:" + escapeIcs(description));
        }
        if (!location.isBlank()) {
            lines.add("LOCATION:" + escapeIcs(location));
        }
        lines.add("STATUS:CONFIRMED");
        lines.add("SEQUENCE:0");
        lines.add("END:VEVENT");
        lines.add("END:VCALENDAR");
        return String.join("\r\n", lines);
    }

    private static Instant parseMeetAt(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw.trim().replace(" ", "T");
        try {
            return Instant.parse(s);
        } catch (Exception ignored) {
            // fall through
        }
        try {
            return java.time.OffsetDateTime.parse(s).toInstant();
        } catch (Exception ignored) {
            // fall through
        }
        try {
            return java.time.LocalDateTime.parse(s)
                    .atZone(java.time.ZoneId.of("Asia/Seoul"))
                    .toInstant();
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String toUtcStamp(Instant instant) {
        return instant.toString().replace("-", "").replace(":", "").replaceAll("\\.\\d+", "");
    }

    private static String escapeIcs(String s) {
        return s.replace("\\", "\\\\")
                .replace(";", "\\;")
                .replace(",", "\\,")
                .replace("\r\n", "\\n")
                .replace("\n", "\\n");
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    private static String joinLocation(String name, String address) {
        String n = nullToEmpty(name);
        String a = nullToEmpty(address);
        if (n.isEmpty()) return a;
        if (a.isEmpty() || a.equals(n)) return n;
        return n + " · " + a;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody FundingBody body) {
        String email = UserContext.require();
        FundingResponse funding = fundingService.create(email, body.toCommand());
        return ResponseEntity.ok(Map.of("success", true, "message", "펀딩이 생성되었어요.", "funding", funding));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> update(@PathVariable Long id, @Valid @RequestBody FundingBody body) {
        String email = UserContext.require();
        FundingResponse funding = fundingService.update(id, email, body.toCommand());
        return ResponseEntity.ok(Map.of("success", true, "message", "펀딩이 수정되었어요.", "funding", funding));
    }

    @PostMapping("/{id}/join")
    public ResponseEntity<Map<String, Object>> join(@PathVariable Long id) {
        String email = UserContext.require();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "참여했어요.",
                "funding", fundingService.join(id, email)
        ));
    }

    @PostMapping("/{id}/leave")
    public ResponseEntity<Map<String, Object>> leave(@PathVariable Long id) {
        String email = UserContext.require();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "참여를 취소했어요.",
                "funding", fundingService.leave(id, email)
        ));
    }

    @PostMapping("/{id}/confirm")
    public ResponseEntity<Map<String, Object>> confirm(@PathVariable Long id) {
        String email = UserContext.require();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "모집이 확정되었어요.",
                "funding", fundingService.confirm(id, email)
        ));
    }

    @PostMapping("/{id}/close")
    public ResponseEntity<Map<String, Object>> close(@PathVariable Long id) {
        String email = UserContext.require();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "모집을 마감했어요.",
                "funding", fundingService.close(id, email)
        ));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> delete(@PathVariable Long id) {
        String email = UserContext.require();
        fundingService.delete(id, email);
        return ResponseEntity.ok(Map.of("success", true, "message", "펀딩을 삭제했어요."));
    }

    @PostMapping("/{id}/schedule")
    public ResponseEntity<Map<String, Object>> confirmSchedule(
            @PathVariable Long id,
            @Valid @RequestBody ScheduleBody body
    ) {
        String email = UserContext.require();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "만남 일정을 확정했어요.",
                "funding", fundingService.confirmSchedule(id, email, body.toCommand())
        ));
    }

    @GetMapping("/{id}/nudge")
    public ResponseEntity<Map<String, Object>> nudge(@PathVariable Long id) {
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", fundingService.nudgeMessage(id)
        ));
    }

    @GetMapping("/{id}/chat")
    public ResponseEntity<Map<String, Object>> chat(@PathVariable Long id) {
        return ResponseEntity.ok(Map.of("success", true, "messages", communityService.listChat(id)));
    }

    @PostMapping("/{id}/chat")
    public ResponseEntity<Map<String, Object>> sendChat(
            @PathVariable Long id,
            @Valid @RequestBody MessageBody body
    ) {
        String email = UserContext.require();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", communityService.sendChat(id, email, body.content())
        ));
    }

    @GetMapping("/{id}/comments")
    public ResponseEntity<Map<String, Object>> comments(@PathVariable Long id) {
        return ResponseEntity.ok(Map.of("success", true, "comments", communityService.listComments(id)));
    }

    @PostMapping("/{id}/comments")
    public ResponseEntity<Map<String, Object>> addComment(
            @PathVariable Long id,
            @Valid @RequestBody CommentBody body
    ) {
        String email = UserContext.require();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "comment", communityService.addComment(id, email, body.content(), body.parentId())
        ));
    }

    @DeleteMapping("/{id}/comments/{commentId}")
    public ResponseEntity<Map<String, Object>> deleteComment(
            @PathVariable Long id,
            @PathVariable Long commentId
    ) {
        String email = UserContext.require();
        communityService.deleteComment(id, commentId, email);
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "댓글을 삭제했어요."
        ));
    }

    @GetMapping("/{id}/reviews")
    public ResponseEntity<Map<String, Object>> listReviews(@PathVariable Long id) {
        return ResponseEntity.ok(Map.of(
                "success", true,
                "reviews", communityService.reviewsForFunding(id)
        ));
    }

    @PostMapping("/{id}/reviews")
    public ResponseEntity<Map<String, Object>> review(
            @PathVariable Long id,
            @Valid @RequestBody ReviewBody body
    ) {
        String email = UserContext.require();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "후기가 저장되었어요.",
                "review", communityService.submitReview(
                        id,
                        email,
                        body.targetEmail(),
                        body.checklist(),
                        body.content(),
                        body.noShow() != null && body.noShow()
                )
        ));
    }

    @PostMapping("/{id}/wishlist")
    public ResponseEntity<Map<String, Object>> wishlist(@PathVariable Long id) {
        String email = UserContext.require();
        return ResponseEntity.ok(communityService.toggleWishlist(email, id));
    }

    public record FundingBody(
            @NotBlank String category,
            @NotBlank @Size(max = 120) String title,
            String description,
            String address,
            String locationName,
            @NotNull Double lat,
            @NotNull Double lng,
            String meetAt,
            String meetTimeText,
            String deadlineAt,
            String deadlineText,
            @NotNull @Min(2) Integer targetCount,
            Integer fee,
            String coverImage
    ) {
        FundingService.FundingCommand toCommand() {
            return new FundingService.FundingCommand(
                    category,
                    title,
                    description,
                    address,
                    locationName,
                    lat,
                    lng,
                    meetAt,
                    meetTimeText,
                    deadlineAt,
                    deadlineText,
                    targetCount,
                    fee == null ? 0 : fee,
                    coverImage
            );
        }
    }

    public record MessageBody(@NotBlank String content) {}

    public record CommentBody(@NotBlank String content, Long parentId) {}

    public record ReviewBody(
            @NotBlank String targetEmail,
            List<String> checklist,
            String content,
            Boolean noShow
    ) {}

    public record ScheduleBody(
            String meetAt,
            String meetTimeText,
            String locationName,
            String address,
            Double lat,
            Double lng
    ) {
        FundingService.ScheduleCommand toCommand() {
            return new FundingService.ScheduleCommand(
                    meetAt, meetTimeText, locationName, address, lat, lng
            );
        }
    }
}
