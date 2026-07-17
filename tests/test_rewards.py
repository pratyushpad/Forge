"""Unit tests for the GRPO reward functions — handmade completions with known rewards."""

from data.gsm8k import extract_gold_answer
from train.rewards import (
    correctness_reward,
    format_reward,
    numeric_reward,
    tag_presence_reward,
)


def wrap(*texts):
    """Build TRL-style conversational completions."""
    return [[{"role": "assistant", "content": t}] for t in texts]


PERFECT = "<reasoning>\n7 boxes with 8 pens each is 7*8 = 56 pens.\n</reasoning>\n<answer>\n56\n</answer>"
RIGHT_ANSWER_BAD_FORMAT = "The answer is definitely <answer>56</answer> trust me"
WRONG_ANSWER_GOOD_FORMAT = "<reasoning>\n7*8 = 54?\n</reasoning>\n<answer>\n54\n</answer>"
NO_TAGS_AT_ALL = "I think the answer is 56."
NON_NUMERIC_ANSWER = "<reasoning>\nHmm.\n</reasoning>\n<answer>\nfifty-six\n</answer>"
FORMATTED_GOLD = "<answer>$1,234.50</answer>"


def test_correctness_reward():
    completions = wrap(
        PERFECT, RIGHT_ANSWER_BAD_FORMAT, WRONG_ANSWER_GOOD_FORMAT, NO_TAGS_AT_ALL
    )
    gold = ["56", "56", "56", "56"]
    assert correctness_reward(completions, gold) == [2.0, 2.0, 0.0, 0.0]


def test_correctness_handles_currency_and_commas():
    assert correctness_reward(wrap(FORMATTED_GOLD), ["1234.5"]) == [2.0]


def test_format_reward():
    completions = wrap(
        PERFECT, RIGHT_ANSWER_BAD_FORMAT, WRONG_ANSWER_GOOD_FORMAT, NO_TAGS_AT_ALL
    )
    assert format_reward(completions) == [0.5, 0.0, 0.5, 0.0]


def test_numeric_reward():
    completions = wrap(PERFECT, NON_NUMERIC_ANSWER, NO_TAGS_AT_ALL)
    assert numeric_reward(completions) == [0.25, 0.0, 0.0]


def test_extract_gold_answer():
    gsm8k_raw = "She sells 16 - 3 - 4 = <<16-3-4=9>>9 eggs a day.\n#### 9"
    assert extract_gold_answer(gsm8k_raw) == "9"
    assert extract_gold_answer("blah\n#### 1,234") == "1234"


def test_tag_presence_reward_is_graded():
    only_answer_tags = "Sure! <answer>56</answer>"
    duplicated_tags = "<answer>1</answer><answer>2</answer>"
    completions = wrap(PERFECT, only_answer_tags, NO_TAGS_AT_ALL, duplicated_tags)
    assert tag_presence_reward(completions) == [0.5, 0.25, 0.0, 0.0]


def test_total_reward_of_perfect_completion_is_max():
    gold = ["56"]
    total = (
        correctness_reward(wrap(PERFECT), gold)[0]
        + format_reward(wrap(PERFECT))[0]
        + numeric_reward(wrap(PERFECT))[0]
        + tag_presence_reward(wrap(PERFECT))[0]
    )
    assert total == 3.25
