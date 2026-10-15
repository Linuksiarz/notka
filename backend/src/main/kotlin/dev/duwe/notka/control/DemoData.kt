package dev.duwe.notka.control

import dev.duwe.notka.entity.model.BackgroundChange
import dev.duwe.notka.entity.model.NoteBlock
import dev.duwe.notka.entity.model.NoteDocument
import dev.duwe.notka.entity.model.NoteSpan
import io.github.oshai.kotlinlogging.KotlinLogging

/**
 * The sample instance, switched on with `DEMO=true`.
 *
 * Two accounts — Alice is the administrator — each with notes of their own, plus two notes they share — one checklist and one
 * text note — so a fresh instance has something to look at and two people to look at it as.
 *
 * The seed only ever fills an **empty** database: restarting a demo instance must not leave a second
 * copy of everything behind.
 */
object DemoData {
    private val logger = KotlinLogging.logger {}

    /** One sample sign-in. The password is public by design: it only ever belongs to a demo. */
    data class DemoAccount(val email: String, val password: String)

    const val ALICE_EMAIL = "alice@example.com"
    const val ALICE_PASSWORD = "alice123"
    const val BOB_EMAIL = "bob@example.com"
    const val BOB_PASSWORD = "bob12345"

    /**
     * The accounts above, in the order the sign-in screen should offer them. Keeping them here means
     * the seeder and the hint cannot drift apart.
     */
    val ACCOUNTS: List<DemoAccount> = listOf(
        DemoAccount(ALICE_EMAIL, ALICE_PASSWORD),
        DemoAccount(BOB_EMAIL, BOB_PASSWORD),
    )

    /**
     * Creates the sample accounts and notes.
     *
     * @return true when this call did the seeding, false when the instance already had accounts.
     */
    fun seed(auth: AuthService, notes: NoteService, sharing: SharingService): Boolean {
        if (auth.hasUsers()) {
            logger.info { "Demo mode: this instance already has accounts, nothing seeded" }
            return false
        }

        // Alice administers the demo, so its server settings have somebody to show them to.
        val alice = auth.register(ALICE_EMAIL, "Alice Nowak", ALICE_PASSWORD, admin = true).user
        val bob = auth.register(BOB_EMAIL, "Bob Kowalski", BOB_PASSWORD).user

        val welcome = notes.create(
            alice.id,
            CreateNoteCommand(
                kind = "TEXT",
                title = "Welcome to Notka",
                document = document(
                    heading(1, "Welcome to Notka"),
                    paragraph("This is a demo instance: everything here is sample data, so change it, break it or delete it."),
                    heading(2, "Markdown shortcuts"),
                    bulleted("Type # for a heading"),
                    bulleted("Type - for a bullet"),
                    bulleted("Type [ ] for a checkbox"),
                    paragraph("Inline: **bold**, *italic*, ~~struck~~ and `code`."),
                ),
            ),
        )
        notes.patch(alice.id, welcome.note.id, PatchNoteCommand(color = "yellow", pinned = true))

        val reading = notes.create(
            alice.id,
            CreateNoteCommand(
                kind = "TEXT",
                title = "Reading list",
                document = document(
                    bulleted("The Pragmatic Programmer"),
                    bulleted("Kotlin in Action"),
                    bulleted("Designing Data-Intensive Applications"),
                ),
            ),
        )

        notes.patch(alice.id, reading.note.id, PatchNoteCommand(background = BackgroundChange.Set("places")))

        val weekend = notes.create(
            alice.id,
            CreateNoteCommand(
                kind = "TEXT",
                title = "Ideas for the weekend",
                document = document(
                    heading(2, "Saturday"),
                    bulleted("Farmers market in the morning"),
                    bulleted("Fix the balcony shelf"),
                    heading(2, "Sunday"),
                    bulleted("Long walk by the river"),
                    paragraph("If it rains: the photography exhibition at **Muzeum Narodowe**."),
                ),
            ),
        )
        notes.patch(alice.id, weekend.note.id, PatchNoteCommand(background = BackgroundChange.Set("celebration")))

        val recipes = notes.create(
            alice.id,
            CreateNoteCommand(
                kind = "LIST",
                title = "Recipes to try",
                document = document(
                    checklist("Sourdough starter", checked = true),
                    checklist("Flatbread"),
                    checklist("Dry ingredients", depth = 1),
                    checklist("Warm water", depth = 1),
                    checklist("Roasted tomato soup"),
                    checklist("Apple cake"),
                ),
            ),
        )
        notes.patch(
            alice.id,
            recipes.note.id,
            PatchNoteCommand(color = "green", background = BackgroundChange.Set("recipes")),
        )

        val meeting = notes.create(
            alice.id,
            CreateNoteCommand(
                kind = "TEXT",
                title = "Meeting notes",
                document = document(
                    heading(2, "Decisions"),
                    bulleted("Ship the live channel behind the flag"),
                    bulleted("Keep the version guard on content only"),
                    heading(2, "Follow-ups"),
                    bulleted("Write the migration notes"),
                    paragraph("Owner: `@bob`, due next **Friday**."),
                ),
            ),
        )
        notes.patch(alice.id, meeting.note.id, PatchNoteCommand(color = "teal"))

        notes.create(
            alice.id,
            CreateNoteCommand(
                kind = "LIST",
                title = "Books to lend",
                document = document(
                    checklist("The Pragmatic Programmer", checked = true),
                    checklist("Kotlin in Action"),
                    checklist("Refactoring"),
                ),
            ),
        )

        // Links, so a demo instance shows the cards a note's addresses turn into. The server fetches
        // them when the note is written; an offline instance simply shows the links without cards.
        notes.create(
            alice.id,
            CreateNoteCommand(
                kind = "TEXT",
                title = "Things to look up",
                document = document(
                    paragraph("The domain example uses: https://example.com/"),
                    paragraph("Where the code lives: https://github.com/"),
                    paragraph("Mailing list archive: https://www.kernel.org/"),
                ),
            ),
        )

        val repairs = notes.create(
            alice.id,
            CreateNoteCommand(
                kind = "LIST",
                title = "Home repairs",
                document = document(
                    checklist("Kitchen"),
                    checklist("Replace the tap washer", depth = 1),
                    checklist("Reseal the worktop", depth = 1),
                    checklist("Hallway"),
                    checklist("Tighten the coat hooks", depth = 1),
                ),
            ),
        )
        notes.patch(alice.id, repairs.note.id, PatchNoteCommand(color = "brown"))

        val shopping = notes.create(
            alice.id,
            CreateNoteCommand(
                kind = "LIST",
                title = "Weekend shopping",
                document = document(
                    checklist("Coffee beans", checked = true),
                    checklist("Olive oil", checked = true),
                    checklist("Sourdough bread"),
                    checklist("Tomatoes"),
                ),
            ),
        )

        notes.patch(alice.id, shopping.note.id, PatchNoteCommand(background = BackgroundChange.Set("groceries")))

        val standup = notes.create(
            bob.id,
            CreateNoteCommand(
                kind = "TEXT",
                title = "Standup notes",
                document = document(
                    heading(2, "Yesterday"),
                    bulleted("Finished the live-update channel"),
                    heading(2, "Today"),
                    bulleted("Write the demo data"),
                    bulleted("Pair on the conflict warning"),
                ),
            ),
        )

        notes.patch(bob.id, standup.note.id, PatchNoteCommand(color = "teal"))

        val lisbon = notes.create(
            bob.id,
            CreateNoteCommand(
                kind = "LIST",
                title = "Lisbon trip",
                document = document(
                    checklist("Flights", checked = true),
                    checklist("Hotel", checked = true),
                    checklist("Packing"),
                    checklist("Passport", depth = 1),
                    checklist("Charger", depth = 1),
                ),
            ),
        )

        notes.patch(bob.id, lisbon.note.id, PatchNoteCommand(background = BackgroundChange.Set("travel")))

        val gym = notes.create(
            bob.id,
            CreateNoteCommand(
                kind = "LIST",
                title = "Gym plan",
                document = document(
                    checklist("Monday: push", checked = true),
                    checklist("Wednesday: pull"),
                    checklist("Friday: legs"),
                    checklist("Stretching after every session", depth = 1),
                ),
            ),
        )
        notes.patch(bob.id, gym.note.id, PatchNoteCommand(background = BackgroundChange.Set("video")))

        val budget = notes.create(
            bob.id,
            CreateNoteCommand(
                kind = "TEXT",
                title = "Budget for June",
                document = document(
                    heading(2, "Fixed"),
                    bulleted("Rent and bills"),
                    bulleted("Transport pass"),
                    heading(2, "Variable"),
                    paragraph("Groceries **900**, eating out **300**, everything else `200`."),
                ),
            ),
        )
        notes.patch(bob.id, budget.note.id, PatchNoteCommand(color = "purple"))

        val podcasts = notes.create(
            bob.id,
            CreateNoteCommand(
                kind = "LIST",
                title = "Podcast queue",
                document = document(
                    checklist("The one about databases", checked = true),
                    checklist("The one about typography"),
                    checklist("The one about sailing"),
                ),
            ),
        )
        notes.patch(bob.id, podcasts.note.id, PatchNoteCommand(background = BackgroundChange.Set("music")))

        val garden = notes.create(
            bob.id,
            CreateNoteCommand(
                kind = "TEXT",
                title = "Garden plans",
                document = document(
                    bulleted("Tomatoes along the south wall"),
                    bulleted("Herbs in the boxes by the door"),
                    paragraph("Order seeds before the **end of March**."),
                ),
            ),
        )
        notes.patch(bob.id, garden.note.id, PatchNoteCommand(color = "green"))

        val gifts = notes.create(
            bob.id,
            CreateNoteCommand(
                kind = "LIST",
                title = "Gifts to buy",
                document = document(
                    checklist("Mum: garden gloves", checked = true),
                    checklist("Dad: the coffee book"),
                    checklist("Niece: art supplies"),
                    checklist("Wrap everything", depth = 1),
                ),
            ),
        )
        notes.patch(bob.id, gifts.note.id, PatchNoteCommand(background = BackgroundChange.Set("celebration")))

        notes.create(
            bob.id,
            CreateNoteCommand(
                kind = "LIST",
                title = "Porto trip",
                document = document(
                    checklist("Flights", checked = true),
                    checklist("Guesthouse", checked = true),
                    checklist("Book the Douro tour"),
                    checklist("Pack"),
                    checklist("Walking shoes", depth = 1),
                    checklist("Rain jacket", depth = 1),
                ),
            ),
        )

        // Shared: a checklist both of them tick, and a text note both of them write.
        val groceries = notes.create(
            alice.id,
            CreateNoteCommand(
                kind = "LIST",
                title = "Groceries together",
                document = document(
                    checklist("Bread", checked = true),
                    checklist("Milk", checked = true),
                    checklist("Apples"),
                    checklist("Coffee"),
                    checklist("Dish soap"),
                ),
            ),
        )
        notes.patch(alice.id, groceries.note.id, PatchNoteCommand(background = BackgroundChange.Set("food")))
        sharing.add(alice.id, groceries.note.id, BOB_EMAIL, "EDIT")

        val apartment = notes.create(
            bob.id,
            CreateNoteCommand(
                kind = "TEXT",
                title = "Apartment ideas",
                document = document(
                    heading(2, "Living room"),
                    bulleted("Move the sofa under the window"),
                    bulleted("A bigger rug"),
                    paragraph("Budget: **1200**, paint and shelves together."),
                    paragraph("The router lives in the hallway, so keep `LAN` in mind."),
                ),
            ),
        )
        notes.patch(bob.id, apartment.note.id, PatchNoteCommand(background = BackgroundChange.Set("notes")))
        sharing.add(bob.id, apartment.note.id, ALICE_EMAIL, "EDIT")

        logger.info { "Demo mode: seeded $ALICE_EMAIL and $BOB_EMAIL" }
        return true
    }

    private fun document(vararg blocks: NoteBlock): NoteDocument = NoteDocument(blocks = blocks.toList())

    private fun paragraph(text: String) = block("paragraph", text)

    private fun heading(level: Int, text: String) = block("heading$level", text)

    private fun bulleted(text: String) = block("bulleted", text)

    private fun checklist(text: String, checked: Boolean = false, depth: Int = 0) = NoteBlock(
        id = nextId(),
        type = "checklist",
        checked = checked,
        depth = depth,
        spans = listOf(NoteSpan(text)),
    )

    private fun block(type: String, text: String) =
        NoteBlock(id = nextId(), type = type, spans = listOf(NoteSpan(text)))

    /** Ids only have to be unique inside one document, and every document here is written once. */
    private var counter = 0
    private fun nextId(): String {
        counter += 1
        return "demo$counter"
    }
}
