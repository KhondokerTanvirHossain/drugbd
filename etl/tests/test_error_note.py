"""Stage error notes are shown on the public batch report: one line, no Postgres internals, bounded length."""
import psycopg
import pytest

from bddrug_etl.stages.results import error_note

PG_MESSAGE = ("canceling statement due to statement timeout\n"
              "CONTEXT:  while updating tuple (0,84) in relation \"batch_item\"\n"
              "SQL statement \"UPDATE ops.batch_item SET review = 'pending'\"")


def test_only_the_first_line_of_a_postgres_error_is_kept():
    assert error_note(psycopg.errors.QueryCanceled(PG_MESSAGE)) == \
        "error: QueryCanceled: canceling statement due to statement timeout"


def test_whitespace_is_collapsed():
    assert error_note(RuntimeError("  DDInter \t HTTP   500  ")) == "error: RuntimeError: DDInter HTTP 500"


def test_leading_blank_lines_are_skipped():
    assert error_note(ValueError("\n\n   \n  real message\nsecond")) == "error: ValueError: real message"


@pytest.mark.parametrize("msg", ["", "   ", "\n\n"])
def test_an_empty_message_gives_the_type_only(msg):
    assert error_note(RuntimeError(msg)) == "error: RuntimeError"


def test_the_message_is_cut_to_200_characters():
    note = error_note(RuntimeError("x" * 500 + "\nmore"))
    assert note == "error: RuntimeError: " + "x" * 200


@pytest.mark.parametrize("exc", [RuntimeError("a\r\nb"), RuntimeError("a\rb"), RuntimeError("a b"), KeyError("a\nb")])
def test_a_note_never_contains_a_line_break(exc):
    note = error_note(exc)
    assert "\n" not in note and "\r" not in note and " " not in note
    assert len(note) <= len(f"error: {type(exc).__name__}: ") + 200
